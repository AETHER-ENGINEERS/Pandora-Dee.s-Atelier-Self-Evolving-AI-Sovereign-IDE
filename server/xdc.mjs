// The webxdc library: .xdc packages unpacked into folders on disk, every version kept,
// served to the desktop on a separate origin so apps can't reach the desktop's storage.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { unzipSync, zipSync, strFromU8 } from "fflate";

export function createLibrary(dataDir) {
  const root = path.join(dataDir, "xdc");
  const stateDir = path.join(dataDir, "xdc-state");
  const indexFile = path.join(root, "index.json");
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });

  /** @type {Pkg[]} */
  let pkgs = [];
  try {
    pkgs = JSON.parse(fs.readFileSync(indexFile, "utf8"));
  } catch {
    pkgs = [];
  }
  const save = () => fs.writeFileSync(indexFile, JSON.stringify(pkgs, null, 1));

  const dirOf = (id) => path.join(root, id);
  const safeId = (id) => /^[a-z0-9-]{4,40}$/.test(id);

  /** Resolve a path inside a package, refusing anything that climbs out. */
  function fileOf(id, rel) {
    if (!safeId(id)) return null;
    const base = dirOf(id);
    const full = path.resolve(base, rel.replace(/^\/+/, ""));
    if (full !== base && !full.startsWith(base + path.sep)) return null;
    return full;
  }

  /** `defaults` fill only what the manifest leaves empty (a shipped app's home repo, say); `extra` overrides. */
  function importXdc(bytes, filename, when = Date.now(), extra = {}, defaults = {}) {
    const id = crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 16);
    const existing = pkgs.find((p) => p.id === id);
    if (existing) return { pkg: existing, added: false };
    let files;
    try {
      files = unzipSync(bytes);
    } catch {
      throw new Error(`${filename} isn't a valid .xdc (zip) file.`);
    }
    const names = Object.keys(files).filter((n) => !n.endsWith("/"));
    if (!names.includes("index.html")) throw new Error(`${filename} has no index.html, so it isn't a webxdc app.`);
    const manifest = names.includes("manifest.toml") ? parseToml(strFromU8(files["manifest.toml"])) : {};
    const dir = dirOf(id);
    for (const n of names) {
      const target = fileOf(id, n);
      if (!target) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, files[n]);
    }
    fs.writeFileSync(path.join(root, `${id}.xdc`), bytes);
    const stem = filename.replace(/\.xdc$/i, "");
    const name = String(manifest.name || defaults.name || prettify(stem));
    /** @type {Pkg} */
    const pkg = {
      id,
      appKey: appKeyOf(name),
      name,
      version: String(manifest.version || manifest.tag_name || versionFromFilename(stem) || ""),
      filename,
      size: bytes.length,
      fileCount: names.length,
      added: Date.now(),
      built: when,
      description: String(manifest.description || manifest.subtitle || ""),
      source: String(manifest.source_code_url || manifest.source || ""),
      // the manifest's own icon when it names one that's there (gomoku.png), else icon.png and friends
      icon: (manifest.icon && names.includes(String(manifest.icon)) ? String(manifest.icon) : "") || names.find((n) => /^icon\.(png|jpe?g|webp|svg)$/i.test(n)) || "",
      parent: "",
      notes: "",
      ...extra,
    };
    for (const [k, v] of Object.entries(defaults)) if (!pkg[k]) pkg[k] = v;
    void dir;
    pkgs.push(pkg);
    save();
    return { pkg, added: true };
  }

  /** Import a single .xdc or a .zip holding many. */
  function importAny(bytes, filename, defaults = {}) {
    const results = [];
    const errors = [];
    if (/\.xdc$/i.test(filename)) {
      results.push(importXdc(bytes, filename, Date.now(), {}, defaults));
    } else {
      const dates = zipDates(bytes);
      let inner;
      try {
        inner = unzipSync(bytes, { filter: (f) => /\.xdc$/i.test(f.name) });
      } catch {
        throw new Error(`${filename} couldn't be opened as a zip.`);
      }
      for (const [name, data] of Object.entries(inner)) {
        try {
          results.push(importXdc(Buffer.from(data), path.basename(name), dates[name] ?? Date.now()));
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }
    }
    return {
      added: results.filter((r) => r.added).map((r) => r.pkg),
      duplicates: results.filter((r) => !r.added).length,
      // every app in the file, whether just added or already here (to open it either way)
      found: results.map((r) => r.pkg),
      errors,
    };
  }

  function remove(id) {
    const pkg = pkgs.find((p) => p.id === id);
    if (!pkg) return false;
    fs.rmSync(dirOf(id), { recursive: true, force: true });
    fs.rmSync(path.join(root, `${id}.xdc`), { force: true });
    pkgs = pkgs.filter((p) => p.id !== id);
    save();
    return true;
  }

  function update(id, patch) {
    const pkg = pkgs.find((p) => p.id === id);
    if (!pkg) return null;
    for (const k of ["notes", "version", "name"]) if (typeof patch[k] === "string") pkg[k] = patch[k].slice(0, 2000);
    if (typeof patch.name === "string") pkg.appKey = appKeyOf(pkg.name);
    save();
    return pkg;
  }

  function walk(dir, base = dir) {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...walk(full, base));
      else out.push(path.relative(base, full).split(path.sep).join("/"));
    }
    return out.sort();
  }

  function listFiles(id) {
    const dir = fileOf(id, "");
    return dir && fs.existsSync(dir) ? walk(dir) : [];
  }

  /** A new version made from an existing one, ready to edit. */
  function fork(id, label) {
    const src = pkgs.find((p) => p.id === id);
    if (!src) return null;
    const nid = `v${crypto.randomBytes(7).toString("hex")}`;
    fs.cpSync(dirOf(id), dirOf(nid), { recursive: true });
    const pkg = { ...src, id: nid, parent: id, added: Date.now(), built: Date.now(), version: label || `${src.version || "edit"}+edit`, notes: "", filename: "" };
    pkgs.push(pkg);
    save();
    return pkg;
  }

  function exportZip(id) {
    const dir = fileOf(id, "");
    if (!dir || !fs.existsSync(dir)) return null;
    const files = {};
    for (const rel of walk(dir)) files[rel] = new Uint8Array(fs.readFileSync(path.join(dir, rel)));
    return Buffer.from(zipSync(files, { level: 6 }));
  }

  // ---- shared state (webxdc status updates), one append-only log per scope ----
  const scopeFile = (scope) => path.join(stateDir, `${scope.replace(/[^a-z0-9@._-]/gi, "_")}.jsonl`);
  function readUpdates(scope, since = 0) {
    const f = scopeFile(scope);
    if (!fs.existsSync(f)) return [];
    return fs
      .readFileSync(f, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .filter((u) => u.serial > since);
  }
  function appendUpdate(scope, entry) {
    const all = readUpdates(scope);
    const serial = (all.length ? all[all.length - 1].serial : 0) + 1;
    const row = { ...entry, serial, at: Date.now() };
    fs.appendFileSync(scopeFile(scope), `${JSON.stringify(row)}\n`);
    return row;
  }
  function clearUpdates(scope) {
    fs.rmSync(scopeFile(scope), { force: true });
  }

  return {
    root,
    list: () => pkgs,
    get: (id) => pkgs.find((p) => p.id === id),
    importAny,
    remove,
    update,
    fork,
    listFiles,
    fileOf,
    exportZip,
    readUpdates,
    appendUpdate,
    clearUpdates,
    save,
  };
}

/** Group key for versions of the same app. */
export function appKeyOf(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "app";
}

function prettify(stem) {
  const base = stem.replace(/[-_ ]?v?\d+([._]\d+)*(-\d+)?$/i, "").replace(/[_-]+/g, " ").trim();
  return base ? base.replace(/\b\w/g, (c) => c.toUpperCase()) : stem;
}

export function versionFromFilename(stem) {
  const m = stem.match(/[-_ ]v?(\d+(?:[._]\d+)*)(?:-(\d+))?$/i);
  if (!m) return "";
  return m[1].replace(/_/g, ".") + (m[2] ? ` (${m[2]})` : "");
}

/** Just enough TOML for webxdc manifests: top-level key = value lines. */
export function parseToml(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("[")) continue;
    const m = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1).replace(/\\"/g, '"');
    else if (/^-?\d+(\.\d+)?$/.test(v)) v = Number(v);
    else if (v === "true" || v === "false") v = v === "true";
    else v = v.replace(/\s+#.*$/, "");
    out[m[1]] = v;
  }
  return out;
}

/** Modification times from a zip's central directory, by entry name. */
export function zipDates(buf) {
  const out = {};
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return out;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const time = buf.readUInt16LE(p + 12);
    const date = buf.readUInt16LE(p + 14);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    out[name] = new Date(1980 + (date >> 9), ((date >> 5) & 15) - 1, date & 31, time >> 11, (time >> 5) & 63, (time & 31) * 2).getTime();
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/**
 * @typedef {{ id: string, appKey: string, name: string, version: string, filename: string, size: number,
 *   fileCount: number, added: number, built: number, description: string, source: string, icon: string,
 *   parent: string, notes: string }} Pkg
 */
