// Explorer: the desktop's file explorer. It reaches the desktop's own places (the vault, Vector's files, music
// folders, the data folder's music), and the rest of this computer only when that's switched on, and then only
// for requests made on this computer itself (never from phones or other devices on the network).
//
// Deleting moves to the data folder's trash, with a note of where each thing came from, so it can be restored.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const win = process.platform === "win32";
const mac = process.platform === "darwin";

export function createFiles({ dataDir, musicFolders, getWholePc, setWholePc }) {
  const trashDir = () => path.join(dataDir(), "trash");
  const trashIndex = () => path.join(trashDir(), "index.json");

  /** The desktop's own places: always reachable, from any device that opens the desktop. */
  function places() {
    const d = dataDir();
    const list = [
      { id: "vault", name: "Vault", path: path.join(d, "vault"), kind: "vault" },
      { id: "vector", name: "Vector files", path: path.join(d, "vector-host", "downloads"), kind: "vector" },
      { id: "music", name: "Music added here", path: path.join(d, "music"), kind: "music" },
      ...musicFolders().map((f, i) => ({ id: `music-${i}`, name: path.basename(f) || f, path: f, kind: "music" })),
    ];
    for (const p of list) if (p.kind !== "music" || p.id === "music") fs.mkdirSync(p.path, { recursive: true });
    return list.filter((p) => fs.existsSync(p.path));
  }

  /** The computer's drives, for when the whole computer is allowed. */
  function drives() {
    if (win)
      return [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"]
        .filter((l) => {
          try {
            return fs.statSync(`${l}:\\`).isDirectory();
          } catch {
            return false; // no such drive, or one with nothing in it (an empty card reader)
          }
        })
        .map((l) => ({ id: `drive-${l}`, name: `${l}:\\`, path: `${l}:\\`, kind: "drive" }));
    return [{ id: "home", name: "Home", path: os.homedir(), kind: "drive" }, { id: "root", name: "/", path: "/", kind: "drive" }];
  }

  const inside = (full, root) => {
    const a = path.resolve(full).toLowerCase(), b = path.resolve(root).toLowerCase();
    return a === b || a.startsWith(b.endsWith(path.sep) ? b : b + path.sep);
  };

  /** A path this request may use, or an error. `local`: the request came from this computer itself. */
  function allowed(p, local) {
    if (!p) throw Object.assign(new Error("No path."), { status: 400 });
    const full = path.resolve(String(p));
    if (local && getWholePc()) return full;
    if (places().some((pl) => inside(full, pl.path))) return full;
    throw Object.assign(new Error("That's outside the desktop's places."), { status: 403 });
  }

  function overview(local) {
    return {
      places: places(),
      wholePc: { on: Boolean(getWholePc()), local, drives: local && getWholePc() ? drives() : [] },
      deviceExplorer: local,
    };
  }

  /** A folder's contents (folders first). The vault's own housekeeping folders stay out of sight. */
  function list(p, local) {
    const dir = allowed(p, local);
    if (!fs.statSync(dir).isDirectory()) throw Object.assign(new Error("That's not a folder."), { status: 400 });
    const hidden = new Set([".trash", ".pandora", "node_modules", ".git"]);
    const entries = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (hidden.has(e.name)) continue;
      const full = path.join(dir, e.name);
      let st;
      try {
        st = fs.statSync(full);
      } catch {
        continue; // a broken link, or something not ours to read
      }
      entries.push({ name: e.name, path: full, dir: st.isDirectory(), size: st.isDirectory() ? 0 : st.size, mtime: st.mtimeMs, ext: st.isDirectory() ? "" : path.extname(e.name).slice(1).toLowerCase() });
    }
    entries.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    // the folder above, while it's still somewhere this request may go
    const up = path.dirname(dir);
    let parent = null;
    try {
      if (up !== dir) parent = allowed(up, local);
    } catch {
      parent = null;
    }
    return { path: dir, parent, entries };
  }

  function stat(p, local) {
    const full = allowed(p, local);
    const st = fs.statSync(full);
    return { path: full, name: path.basename(full), dir: st.isDirectory(), size: st.size, mtime: st.mtimeMs, ctime: st.birthtimeMs || st.ctimeMs, ext: path.extname(full).slice(1).toLowerCase() };
  }

  const safeName = (n) => path.basename(String(n || "")).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim() || "file";

  /** A free name in `dir` ("photo.jpg", then "photo (2).jpg"…). */
  function freeName(dir, name) {
    const ext = path.extname(name), stem = name.slice(0, name.length - ext.length);
    let n = 1, candidate = name;
    while (fs.existsSync(path.join(dir, candidate))) candidate = `${stem} (${++n})${ext}`;
    return path.join(dir, candidate);
  }

  function upload(dirP, name, bytes, local) {
    const dir = allowed(dirP, local);
    fs.mkdirSync(dir, { recursive: true });
    const file = freeName(dir, safeName(name));
    fs.writeFileSync(file, bytes);
    return file;
  }

  function mkdir(dirP, name, local) {
    const parent = allowed(dirP, local);
    const dir = freeName(parent, safeName(name || "New folder"));
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  /** Move across drives too (copy, then remove the original). */
  function moveAny(from, to) {
    try {
      fs.renameSync(from, to);
    } catch (e) {
      if (e.code !== "EXDEV") throw e;
      fs.cpSync(from, to, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
      fs.rmSync(from, { recursive: true, force: true });
    }
  }

  /** Rename (a new name in the same folder) or move (into another folder). */
  function move(fromP, { name, into }, local) {
    const from = allowed(fromP, local);
    const dir = into ? allowed(into, local) : path.dirname(from);
    if (inside(dir, from)) throw Object.assign(new Error("A folder can't go inside itself."), { status: 400 });
    const target = path.join(dir, name ? safeName(name) : path.basename(from));
    if (path.resolve(target).toLowerCase() === path.resolve(from).toLowerCase() && target !== from) {
      fs.renameSync(from, target); // only the letters' case changed
      return target;
    }
    if (fs.existsSync(target)) throw Object.assign(new Error("Something there already has that name."), { status: 409 });
    moveAny(from, target);
    return target;
  }

  function readTrash() {
    try {
      return JSON.parse(fs.readFileSync(trashIndex(), "utf8"));
    } catch {
      return [];
    }
  }
  const writeTrash = (list) => (fs.mkdirSync(trashDir(), { recursive: true }), fs.writeFileSync(trashIndex(), JSON.stringify(list, null, 1)));

  function trash(p, local) {
    const from = allowed(p, local);
    if (places().some((pl) => path.resolve(pl.path).toLowerCase() === from.toLowerCase())) throw Object.assign(new Error("A place itself can't go to the trash."), { status: 400 });
    const id = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
    const to = path.join(trashDir(), id, path.basename(from));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    moveAny(from, to);
    writeTrash([...readTrash(), { id, from, name: path.basename(from), at: Date.now() }]);
    return { id };
  }

  function trashList() {
    return readTrash().filter((t) => fs.existsSync(path.join(trashDir(), t.id, t.name))).sort((a, b) => b.at - a.at);
  }

  /** Back where it was (or beside it, with a new name, if that name is taken now). */
  function restore(id, local) {
    const list = readTrash();
    const t = list.find((x) => x.id === id);
    if (!t) throw Object.assign(new Error("That isn't in the trash."), { status: 404 });
    const dir = allowed(path.dirname(t.from), local);
    fs.mkdirSync(dir, { recursive: true });
    const to = freeName(dir, t.name);
    moveAny(path.join(trashDir(), t.id, t.name), to);
    fs.rmSync(path.join(trashDir(), t.id), { recursive: true, force: true });
    writeTrash(list.filter((x) => x.id !== id));
    return to;
  }

  /** The computer's own file manager, with the file selected (only for requests made on this computer). */
  function revealOnDevice(p, local) {
    if (!local) throw Object.assign(new Error("That opens on the computer running the desktop; it isn't available from here."), { status: 403 });
    const full = allowed(p, local);
    const isDir = fs.statSync(full).isDirectory();
    // Explorer wants exactly /select,"C:\a path\file" (its own quoting, not the usual)
    if (win) spawn("explorer.exe", [isDir ? `"${full}"` : `/select,"${full}"`], { detached: true, stdio: "ignore", windowsVerbatimArguments: true }).unref();
    else if (mac) spawn("open", isDir ? [full] : ["-R", full], { detached: true, stdio: "ignore" }).unref();
    else spawn("xdg-open", [isDir ? full : path.dirname(full)], { detached: true, stdio: "ignore" }).unref();
  }

  function setWhole(on, local) {
    if (!local) throw Object.assign(new Error("This can only be changed on the computer running the desktop."), { status: 403 });
    setWholePc(Boolean(on));
    return overview(local);
  }

  return { overview, list, stat, allowed, upload, mkdir, move, trash, trashList, restore, revealOnDevice, setWhole };
}
