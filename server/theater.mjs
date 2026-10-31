// Media Theater: a home for videos on the desktop, so phones can let go of them and still watch them anywhere.
// Videos live in the vault's "Videos" folder (each folder inside it is a shelf), plus any video that came in through
// the phone's share menu (Vault › From devices). Uploads arrive in checked pieces and can pick up where they stopped,
// so a big video survives a dropped Wi-Fi connection. Thumbnails and favourites are kept in the vault's .pandora
// folder, keyed by size and date so they follow a video when it's renamed or moved.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const VIDEO_EXT = new Set(["mp4", "m4v", "mov", "webm", "mkv", "3gp", "avi", "ogv"]);
/** The most one upload piece may be; the desktop's page sends 8 MB. */
export const PIECE_MAX = 16 * 1024 * 1024;

export function createTheater({ vaultDir }) {
  const root = () => path.join(vaultDir(), "Videos");
  const fromDevices = () => path.join(vaultDir(), "From devices");
  const meta = () => path.join(vaultDir(), ".pandora", "theater");
  const metaFile = () => path.join(meta(), "theater.json");
  const thumbs = () => path.join(meta(), "thumbs");
  const parts = () => path.join(meta(), "parts");

  const fail = (status, message) => Object.assign(new Error(message), { status });
  const safe = (n, fallback) => path.basename(String(n || "")).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/^\.+/, "").trim().slice(0, 120) || fallback;
  /** A video's id: its size and modified time, which stay the same through a rename or a move. */
  const idOf = (st) => `${st.size.toString(36)}-${Math.round(st.mtimeMs / 1000).toString(36)}`;

  function readMeta() {
    try {
      const j = JSON.parse(fs.readFileSync(metaFile(), "utf8"));
      return { favs: j.favs ?? {}, seconds: j.seconds ?? {} };
    } catch {
      return { favs: {}, seconds: {} };
    }
  }
  function writeMeta(m) {
    fs.mkdirSync(meta(), { recursive: true });
    const tmp = `${metaFile()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(m));
    fs.renameSync(tmp, metaFile());
  }

  const shelfDir = (shelf) => {
    const s = String(shelf || "").trim();
    return s ? path.join(root(), safe(s, "Videos")) : root();
  };

  /** Every video, newest first, with its shelf (the folder under Videos, or "From devices"). */
  function list() {
    fs.mkdirSync(root(), { recursive: true });
    const m = readMeta();
    const out = [];
    const shelves = [];
    const walk = (dir, shelf, depth) => {
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.name.startsWith(".")) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (depth === 0) shelves.push(e.name);
          if (depth < 3) walk(full, shelf ?? e.name, depth + 1);
          continue;
        }
        const ext = path.extname(e.name).slice(1).toLowerCase();
        if (!VIDEO_EXT.has(ext)) continue;
        let st;
        try {
          st = fs.statSync(full);
        } catch {
          continue;
        }
        const id = idOf(st);
        out.push({
          id,
          path: full,
          name: e.name.slice(0, e.name.length - ext.length - 1),
          ext,
          shelf: shelf ?? "",
          size: st.size,
          mtime: st.mtimeMs,
          seconds: m.seconds[id] ?? 0,
          thumb: fs.existsSync(path.join(thumbs(), `${id}.jpg`)) ? 1 : fs.existsSync(path.join(thumbs(), `${id}.none`)) ? -1 : 0,
          fav: Boolean(m.favs[id]),
        });
      }
    };
    walk(root(), null, 0);
    if (fs.existsSync(fromDevices())) {
      const before = out.length;
      walk(fromDevices(), "From devices", 1);
      if (out.length > before) shelves.push("From devices");
    }
    out.sort((a, b) => b.mtime - a.mtime);
    shelves.sort((a, b) => (a === "From devices") - (b === "From devices") || a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
    return { root: root(), shelves, videos: out };
  }

  /** Which of these (name and size, from a phone) are already kept here, anywhere in the Theater. */
  function have(items) {
    const all = list().videos;
    const key = (name, size) => `${String(name).toLowerCase()}\u0000${size}`;
    const known = new Map(all.map((v) => [key(`${v.name}.${v.ext}`, v.size), v.path]));
    const bySize = new Map(all.map((v) => [v.size, v.path]));
    return (Array.isArray(items) ? items : []).map((it) => {
      const size = Number(it?.size) || 0;
      // a renamed copy still counts when the size matches to the byte and it's big enough to be unmistakable
      return known.get(key(it?.name ?? "", size)) ?? (size > 5_000_000 ? bySize.get(size) : undefined) ?? null;
    });
  }

  function mkShelf(name) {
    const dir = path.join(root(), safe(name, "New shelf"));
    fs.mkdirSync(dir, { recursive: true });
    return path.basename(dir);
  }

  // ---- uploads, in pieces ----

  const partFile = (shelf, name, size) => path.join(parts(), `${crypto.createHash("sha1").update(`${shelfDir(shelf)}\u0000${name}\u0000${size}`).digest("hex")}.part`);

  /** How much of this upload is here already (to carry on after a dropped connection). */
  function uploadState({ shelf, name, size }) {
    const n = safe(name, "video.mp4");
    const p = partFile(shelf, n, Number(size));
    return { have: fs.existsSync(p) ? fs.statSync(p).size : 0 };
  }

  /** One piece of an upload, checked against the SHA-256 the phone sent with it. The last piece files the video. */
  function uploadPiece({ shelf, name, size, offset, sha256, modified }, bytes) {
    const total = Number(size), at = Number(offset);
    if (!Number.isFinite(total) || total <= 0) throw fail(400, "How big is it?");
    if (!Number.isFinite(at) || at < 0) throw fail(400, "Where does this piece go?");
    if (bytes.length > PIECE_MAX) throw fail(413, "That piece is too big.");
    const n = safe(name, "video.mp4");
    if (!VIDEO_EXT.has(path.extname(n).slice(1).toLowerCase())) throw fail(400, `${n} isn't a video the Theater keeps (mp4, mov, webm, mkv…).`);
    if (sha256 && crypto.createHash("sha256").update(bytes).digest("hex") !== String(sha256).toLowerCase()) throw fail(422, "That piece arrived damaged; sending it again.");
    fs.mkdirSync(parts(), { recursive: true });
    const p = partFile(shelf, n, total);
    const have = fs.existsSync(p) ? fs.statSync(p).size : 0;
    if (at !== have) return { have, done: false, path: null };
    if (at + bytes.length > total) throw fail(400, "That's more than the whole video.");
    fs.appendFileSync(p, bytes);
    const now = have + bytes.length;
    if (now < total) return { have: now, done: false, path: null };
    // all here: into its shelf, under a free name, with the phone's own date so it sorts where it belongs
    const dir = shelfDir(shelf);
    fs.mkdirSync(dir, { recursive: true });
    const ext = path.extname(n), stem = n.slice(0, n.length - ext.length);
    let k = 1, target = path.join(dir, n);
    while (fs.existsSync(target)) target = path.join(dir, `${stem} (${++k})${ext}`);
    fs.renameSync(p, target);
    const when = Number(modified);
    if (when > 0) fs.utimesSync(target, new Date(), new Date(when));
    if (fs.statSync(target).size !== total) throw fail(500, "The finished video isn't the right size.");
    return { have: total, done: true, path: target };
  }

  /** Throw away an unfinished upload. */
  function dropUpload({ shelf, name, size }) {
    fs.rmSync(partFile(shelf, safe(name, "video.mp4"), Number(size)), { force: true });
  }

  /** Unfinished uploads nobody came back to for a week. */
  function sweep() {
    try {
      for (const f of fs.readdirSync(parts())) {
        const p = path.join(parts(), f);
        if (Date.now() - fs.statSync(p).mtimeMs > 7 * 86400_000) fs.rmSync(p, { force: true });
      }
    } catch {
      /* nothing there yet */
    }
  }

  // ---- thumbnails and favourites ----

  const checkId = (id) => {
    if (!/^[a-z0-9]{1,14}-[a-z0-9]{1,10}$/.test(String(id))) throw fail(400, "Which video?");
    return String(id);
  };
  const thumbFile = (id) => path.join(thumbs(), `${checkId(id)}.jpg`);

  /** A picture from the video (made by whichever page could play it); an empty one means "couldn't make one". */
  function setThumb(id, bytes, seconds) {
    fs.mkdirSync(thumbs(), { recursive: true });
    if (!bytes.length) fs.writeFileSync(path.join(thumbs(), `${checkId(id)}.none`), "");
    else {
      if (bytes.length > 2_000_000 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw fail(400, "Send the thumbnail as a JPEG.");
      fs.writeFileSync(thumbFile(id), bytes);
    }
    const s = Number(seconds);
    if (s > 0) {
      const m = readMeta();
      m.seconds[id] = Math.round(s * 10) / 10;
      writeMeta(m);
    }
  }

  function setFav(id, on) {
    const m = readMeta();
    if (on) m.favs[checkId(id)] = Date.now();
    else delete m.favs[checkId(id)];
    writeMeta(m);
    return { fav: Boolean(on) };
  }

  /** May this request touch this file? Only videos inside the Theater's own folders. */
  function owns(p) {
    const full = path.resolve(String(p || ""));
    const inside = (r) => full.toLowerCase().startsWith(path.resolve(r).toLowerCase() + path.sep);
    return (inside(root()) || inside(fromDevices())) && VIDEO_EXT.has(path.extname(full).slice(1).toLowerCase()) ? full : null;
  }

  /** Onto another shelf ("" = straight in Videos). */
  function moveTo(p, shelf) {
    const from = owns(p);
    if (!from || !fs.existsSync(from)) throw fail(404, "That video isn't there any more.");
    const dir = shelfDir(shelf);
    fs.mkdirSync(dir, { recursive: true });
    const name = path.basename(from), ext = path.extname(name), stem = name.slice(0, name.length - ext.length);
    let k = 1, target = path.join(dir, name);
    if (path.resolve(target).toLowerCase() === from.toLowerCase()) return from;
    while (fs.existsSync(target)) target = path.join(dir, `${stem} (${++k})${ext}`);
    fs.renameSync(from, target);
    return target;
  }

  return { root, list, have, mkShelf, uploadState, uploadPiece, dropUpload, sweep, thumbFile, setThumb, setFav, owns, moveTo };
}
