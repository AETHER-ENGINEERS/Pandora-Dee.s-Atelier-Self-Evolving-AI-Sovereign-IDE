// Each character's files on disk, so her other bodies can share them: data/bodies/<id>/, in Classic's layout
// (/Pandora/SOUL.md, /Pandora/Memory.md, /agents.md, /Pandora/Journal/…), the layout Pandora Dee, Jade Vault and
// jade-py read as a vault. The desktop mirrors her files here (lib/bodies.ts); what another body changes since the
// last mirror can be taken back from here, file by file, when the person asks.

import fs from "node:fs";
import path from "node:path";

export const BODY_ID = /^[\w-]{1,64}$/;
const TEXT = /\.(md|json|txt|js|ts|py|yaml|yml|csv|lisp|dl|html|css)$/i;
const MANIFEST = ".mirror.json";

export function createBodies({ dataDir }) {
  const dirOf = (id) => {
    if (!BODY_ID.test(id)) throw Object.assign(new Error("That isn't a character id."), { status: 400 });
    return path.join(dataDir(), "bodies", id);
  };
  /** A vault path ("/Pandora/SOUL.md") inside her folder, refusing anything that climbs out. */
  const fileIn = (dir, p) => {
    const full = path.resolve(dir, String(p).replace(/^\/+/, ""));
    if (!full.startsWith(dir + path.sep)) throw Object.assign(new Error(`${p} isn't inside her folder.`), { status: 400 });
    return full;
  };
  const walk = (dir, base = dir, out = []) => {
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, base, out);
      else if (e.name !== MANIFEST && TEXT.test(e.name)) out.push(full);
    }
    return out;
  };
  const vaultPath = (dir, full) => "/" + path.relative(dir, full).split(path.sep).join("/");
  const readManifest = (dir) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, MANIFEST), "utf8"));
    } catch {
      return {};
    }
  };

  return {
    dir: dirOf,

    /** Mirror her files (vault path → text): written, and anything of hers no longer there removed. */
    write(id, files) {
      const dir = dirOf(id);
      fs.mkdirSync(dir, { recursive: true });
      const manifest = {};
      for (const [p, text] of Object.entries(files)) {
        const full = fileIn(dir, p);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        if (!fs.existsSync(full) || fs.readFileSync(full, "utf8") !== text) fs.writeFileSync(full, String(text));
        manifest[vaultPath(dir, full)] = fs.statSync(full).mtimeMs;
      }
      for (const full of walk(dir)) if (!(vaultPath(dir, full) in manifest)) fs.rmSync(full, { force: true });
      fs.writeFileSync(path.join(dir, MANIFEST), JSON.stringify(manifest));
      return { dir, files: Object.keys(manifest).length };
    },

    /** Her folder as it is, and which files another body changed (or added) since the last mirror. */
    read(id) {
      const dir = dirOf(id);
      const manifest = readManifest(dir);
      const files = {};
      const changed = [];
      for (const full of walk(dir)) {
        const p = vaultPath(dir, full);
        files[p] = fs.readFileSync(full, "utf8");
        if (!(p in manifest) || fs.statSync(full).mtimeMs > manifest[p] + 1) changed.push(p);
      }
      return { dir, files, changed };
    },
  };
}
