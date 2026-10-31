// Music: your folders scanned for audio (tags and covers read with music-metadata), files served with
// seeking, and internet radio relayed so the page's visualizer may read it. Only files in the index can
// be served: a folder is added from the desktop page, never from a request's path.

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";

/** "/f/Music" (how Git Bash writes F:\Music) → "F:\Music" on Windows. */
export function fromMsys(p) {
  const m = /^\/([a-zA-Z])(\/.*)?$/.exec(p);
  return m && process.platform === "win32" ? `${m[1].toUpperCase()}:${(m[2] || "/").replace(/\//g, "\\")}` : p;
}

/**
 * Folders inside a folder, for picking music folders from the desktop page (names only, no files). With no
 * path: the drives (Windows) or the usual places (Mac, Linux).
 */
export async function listFolders(where) {
  const home = process.env.USERPROFILE || process.env.HOME || "/";
  if (!where) {
    // each place is checked at the same time, and a disconnected network drive gets 1.5 s before it's left out
    const isDir = (p) =>
      Promise.race([fs.promises.stat(p).then((s) => s.isDirectory(), () => false), new Promise((ok) => setTimeout(() => ok(false), 1500))]);
    const candidates = [[path.join(home, "Music"), "Music (yours)"], [home, "Home"]];
    if (process.platform === "win32") for (const l of "CDEFGHIJKLMNOPQRSTUVWXYZ") candidates.push([`${l}:\\`, `${l}:`]);
    else candidates.push(["/Volumes", "Volumes"], ["/media", "media"], ["/mnt", "mnt"], ["/", "/"]);
    const ok = await Promise.all(candidates.map(([p]) => isDir(p)));
    return { path: "", parent: null, folders: candidates.filter((_, i) => ok[i]).map(([p, name]) => ({ path: p, name })), audio: 0 };
  }
  const dir = path.resolve(fromMsys(String(where)));
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const folders = [];
  let audio = 0;
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name === "$RECYCLE.BIN" || e.name === "System Volume Information") continue;
    let isDir = e.isDirectory();
    if (e.isSymbolicLink()) {
      try {
        isDir = fs.statSync(path.join(dir, e.name)).isDirectory();
      } catch {
        isDir = false;
      }
    }
    if (isDir) folders.push({ path: path.join(dir, e.name), name: e.name });
    else if (AUDIO.test(e.name)) audio++;
  }
  folders.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  const up = path.dirname(dir);
  return { path: dir, parent: up === dir ? "" : up, folders, audio };
}

const AUDIO = /\.(mp3|m4a|m4b|aac|flac|ogg|oga|opus|wav|wma|webm|mka|aiff?|caf|alac)$/i;
const MIME = { mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", wav: "audio/wav", webm: "audio/webm", mka: "audio/x-matroska", aif: "audio/aiff", aiff: "audio/aiff", wma: "audio/x-ms-wma" };
const MAX_FILES = 50_000;

export function createMusic(dataDir) {
  const indexFile = path.join(dataDir, "music-index.json");
  const ownDir = path.join(dataDir, "music");
  let index = { folders: [], tracks: {} };
  try {
    index = JSON.parse(fs.readFileSync(indexFile, "utf8"));
  } catch {
    /* first time */
  }
  const save = () => {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(indexFile, JSON.stringify(index));
  };
  const idOf = (p) => createHash("sha1").update(p).digest("hex").slice(0, 16);

  // folders read in the last scan, and ones that couldn't be opened
  let walked = 0;
  let unreadable = [];

  /** Every audio file under `dir`, following folder junctions and links (Windows libraries, OneDrive, moved Music folders). */
  function walk(dir, out, depth = 0, seen = new Set()) {
    if (depth > 24 || out.length >= MAX_FILES) return out;
    let real = dir;
    try {
      real = fs.realpathSync(dir);
    } catch {
      /* use it as given */
    }
    if (seen.has(real)) return out; // a link back up the tree
    seen.add(real);
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
      walked++;
    } catch {
      unreadable.push(dir);
      return out;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name === "$RECYCLE.BIN" || e.name === "System Volume Information") continue;
      const full = path.join(dir, e.name);
      let isDir = e.isDirectory();
      let isFile = e.isFile();
      if (e.isSymbolicLink() || (!isDir && !isFile)) {
        try {
          const st = fs.statSync(full);
          isDir = st.isDirectory();
          isFile = st.isFile();
        } catch {
          continue;
        }
      }
      if (isDir) walk(full, out, depth + 1, seen);
      else if (isFile && AUDIO.test(e.name)) out.push(full);
      if (out.length >= MAX_FILES) break;
    }
    return out;
  }

  /** Read every folder again; only new or changed files are opened. */
  async function scan(folders) {
    const { parseFile } = await import("music-metadata");
    walked = 0;
    unreadable = [];
    const list = [...new Set([ownDir, ...folders.map((f) => path.resolve(fromMsys(String(f).trim().replace(/^["']|["']$/g, ""))))])];
    index.folders = list.filter((f) => f !== ownDir);
    const seen = new Set();
    let read = 0;
    let failed = 0;
    for (const folder of list) {
      if (!fs.existsSync(folder)) continue;
      for (const file of walk(folder, [])) {
        const id = idOf(file);
        seen.add(id);
        let st;
        try {
          st = fs.statSync(file);
        } catch {
          continue;
        }
        const old = index.tracks[id];
        if (old && old.mtime === st.mtimeMs && old.size === st.size) continue;
        const base = path.basename(file).replace(/\.[^.]+$/, "");
        const t = { id, path: file, folder, size: st.size, mtime: st.mtimeMs, title: base, artist: "", album: "", year: 0, track: 0, genre: "", duration: 0, cover: false, bitrate: 0 };
        try {
          const m = await parseFile(file, { duration: false, skipCovers: false });
          const c = m.common;
          Object.assign(t, {
            title: c.title || base,
            artist: c.artist || (c.artists || []).join(", ") || "",
            album: c.album || "",
            year: c.year || 0,
            track: c.track?.no || 0,
            genre: (c.genre || []).join(", "),
            duration: Math.round(m.format.duration || 0),
            bitrate: Math.round((m.format.bitrate || 0) / 1000),
            cover: Boolean(c.picture?.length),
            comment: (c.comment || []).map((x) => (typeof x === "string" ? x : x.text)).filter(Boolean).join(" ").slice(0, 300),
          });
          read++;
        } catch {
          failed++;
        }
        index.tracks[id] = t;
      }
    }
    for (const id of Object.keys(index.tracks)) if (!seen.has(id)) delete index.tracks[id];
    save();
    return { tracks: Object.keys(index.tracks).length, read, failed, folders: index.folders, walked, unreadable: unreadable.slice(0, 5) };
  }

  // (the file's own name goes along, for saying which file when one won't play; its full path stays here)
  const list = () => ({ folders: index.folders, own: ownDir, tracks: Object.values(index.tracks).map(({ path: p, mtime: _m, ...t }) => ({ ...t, file: path.basename(p) })) });

  /** Stream a track, with byte ranges so seeking works. */
  function serve(req, res, id) {
    const t = index.tracks[id];
    if (!t || !fs.existsSync(t.path)) {
      res.statusCode = 404;
      return res.end();
    }
    const size = fs.statSync(t.path).size;
    const type = MIME[path.extname(t.path).slice(1).toLowerCase()] || "application/octet-stream";
    const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ""));
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", "no-store");
    if (range) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
      if (start >= size || start > end) {
        res.statusCode = 416;
        res.setHeader("Content-Range", `bytes */${size}`);
        return res.end();
      }
      res.statusCode = 206;
      res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
      res.setHeader("Content-Length", end - start + 1);
      return fs.createReadStream(t.path, { start, end }).pipe(res);
    }
    res.statusCode = 200;
    res.setHeader("Content-Length", size);
    fs.createReadStream(t.path).pipe(res);
  }

  async function cover(res, id) {
    const t = index.tracks[id];
    if (!t?.cover) {
      res.statusCode = 404;
      return res.end();
    }
    try {
      const { parseFile, selectCover } = await import("music-metadata");
      const m = await parseFile(t.path, { duration: false });
      const pic = selectCover(m.common.picture);
      if (!pic) throw new Error("none");
      res.setHeader("Content-Type", pic.format || "image/jpeg");
      res.setHeader("Cache-Control", "max-age=86400");
      res.end(Buffer.from(pic.data));
    } catch {
      res.statusCode = 404;
      res.end();
    }
  }

  /** Relay a radio stream (same-origin for the page, so its visualizer can read the sound). */
  async function radio(req, res, url) {
    let u;
    try {
      u = new URL(url);
    } catch {
      res.statusCode = 400;
      return res.end("Bad address");
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      res.statusCode = 400;
      return res.end("Bad address");
    }
    const ctrl = new AbortController();
    req.on("close", () => ctrl.abort());
    try {
      const r = await fetch(u, { headers: { "User-Agent": "PandoraDeeDesktop/3.10", "Icy-MetaData": "0" }, signal: ctrl.signal, redirect: "follow" });
      if (!r.ok || !r.body) {
        res.statusCode = 502;
        return res.end(`The station answered ${r.status}`);
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", r.headers.get("content-type") || "audio/mpeg");
      res.setHeader("Cache-Control", "no-store");
      Readable.fromWeb(r.body).on("error", () => res.end()).pipe(res);
    } catch {
      if (!res.headersSent) res.statusCode = 502;
      res.end();
    }
  }

  /** A file added from the page goes into the data folder's music/. */
  function upload(name, bytes) {
    fs.mkdirSync(ownDir, { recursive: true });
    const clean = path.basename(String(name)).replace(/[\\/:*?"<>|]+/g, "_") || "track";
    if (!AUDIO.test(clean)) throw new Error("That isn't an audio file this player knows.");
    let target = path.join(ownDir, clean);
    for (let i = 2; fs.existsSync(target); i++) target = path.join(ownDir, clean.replace(/(\.[^.]+)$/, ` ${i}$1`));
    fs.writeFileSync(target, bytes);
    return path.basename(target);
  }

  /** Everything about one song for its Properties: where the file is, and how it's encoded. */
  async function info(id) {
    const t = index.tracks[id];
    if (!t) return null;
    let st = null;
    try {
      st = fs.statSync(t.path);
    } catch {
      /* gone since the last scan */
    }
    let format = {};
    try {
      const { parseFile } = await import("music-metadata");
      const m = await parseFile(t.path, { duration: true, skipCovers: true });
      const f = m.format;
      format = { container: f.container, codec: f.codec, sampleRate: f.sampleRate, channels: f.numberOfChannels, bitsPerSample: f.bitsPerSample, lossless: f.lossless, bitrate: f.bitrate ? Math.round(f.bitrate) : undefined, duration: f.duration };
    } catch {
      /* not readable now */
    }
    const { mtime: _m, ...rest } = t;
    return { ...rest, ...format, size: st?.size ?? t.size, modified: st?.mtimeMs ?? t.mtime, exists: Boolean(st), own: path.dirname(t.path) === ownDir || t.path.startsWith(ownDir + path.sep) };
  }

  return { scan, list, serve, cover, radio, upload, info, folders: () => index.folders };
}
