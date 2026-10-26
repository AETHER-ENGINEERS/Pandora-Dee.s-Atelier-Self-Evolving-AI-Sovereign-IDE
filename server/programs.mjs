// Finding the programs the relay can use (Python, cURL) on the computer running the desktop.
// Forgiving on purpose: PATH entries written the Git Bash way (/f/folder) are understood, the Windows
// "py" launcher is tried, and common install folders are searched (python.org, uv, F:\uv-python…).

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

const win = process.platform === "win32";

/** "/f/uv-python/x" → "F:\uv-python\x" (Git Bash / MSYS spelling of a Windows path). */
function fromMsys(p) {
  const m = /^\/([a-zA-Z])(\/.*)?$/.exec(p);
  return m && win ? `${m[1].toUpperCase()}:${(m[2] || "/").replace(/\//g, "\\")}` : p;
}

function pathDirs() {
  const raw = process.env.PATH || process.env.Path || "";
  // a Windows PATH uses ";"; an MSYS-style list may use ":" between /x/... entries
  const parts = raw.split(win ? ";" : ":").flatMap((p) => (win && /^\/[a-zA-Z]\//.test(p) && p.includes(":/") ? p.split(":") : [p]));
  return parts.map((p) => fromMsys(p.trim().replace(/^"|"$/g, ""))).filter(Boolean);
}

const isFile = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

/** Folders inside `dir` (one level), newest-looking names first. */
const kids = (dir) => {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() || e.isSymbolicLink())
      .map((e) => path.join(dir, e.name))
      .sort()
      .reverse();
  } catch {
    return [];
  }
};

function version(cmd, args = []) {
  try {
    const r = spawnSync(cmd, [...args, "--version"], { encoding: "utf8", timeout: 5000, windowsHide: true });
    if (r.error || r.status !== 0) return "";
    return (r.stdout || r.stderr || "").trim().split("\n")[0];
  } catch {
    return "";
  }
}

const cache = new Map();

/**
 * Where Python is: { cmd, args, version } or null. `wanted` is a path the person chose (a python
 * executable or the folder holding it).
 */
export function findPython(wanted = "") {
  const key = `py:${wanted}`;
  if (cache.has(key)) return cache.get(key);
  const tries = [];
  const exe = win ? ["python.exe", "python3.exe"] : ["python3", "python"];
  const add = (cmd, args = []) => tries.push({ cmd, args });
  if (wanted) {
    const w = fromMsys(wanted.trim().replace(/^"|"$/g, ""));
    if (isFile(w)) add(w);
    else for (const e of exe) add(path.join(w, e));
  }
  if (process.env.PDD_PYTHON) add(fromMsys(process.env.PDD_PYTHON));
  for (const d of pathDirs()) for (const e of exe) if (isFile(path.join(d, e)) && !/WindowsApps/i.test(d)) add(path.join(d, e));
  if (win) add("py", ["-3"]);
  const home = os.homedir();
  const roots = win
    ? [
        ...["C", "D", "E", "F", "G", "H"].map((l) => `${l}:\\uv-python`),
        path.join(process.env.APPDATA || "", "uv", "python"),
        path.join(process.env.LOCALAPPDATA || "", "Programs", "Python"),
        ...["C", "D", "E", "F", "H"].map((l) => `${l}:\\`),
      ]
    : [path.join(home, ".local", "share", "uv", "python"), "/usr/local/bin", "/usr/bin", "/opt/homebrew/bin"];
  for (const r of roots)
    for (const d of r.length <= 3 ? kids(r).filter((k) => /python/i.test(path.basename(k))) : kids(r))
      for (const e of exe) {
        const p = path.join(d, e);
        if (isFile(p)) add(p);
        const bin = path.join(d, "bin", e);
        if (isFile(bin)) add(bin);
      }
  if (!win) for (const r of roots) for (const e of exe) if (isFile(path.join(r, e))) add(path.join(r, e));
  for (const t of tries) {
    const v = version(t.cmd, t.args);
    if (/^Python 3/.test(v)) {
      const found = { ...t, version: v };
      cache.set(key, found);
      return found;
    }
  }
  cache.set(key, null);
  return null;
}

export function findCurl() {
  if (cache.has("curl")) return cache.get("curl");
  const candidates = ["curl", ...(win ? [path.join(process.env.SystemRoot || "C:\\Windows", "System32", "curl.exe")] : [])];
  for (const c of candidates) {
    const v = version(c);
    if (/^curl /.test(v)) {
      const found = { cmd: c, args: [], version: v.split(" ").slice(0, 2).join(" ") };
      cache.set("curl", found);
      return found;
    }
  }
  cache.set("curl", null);
  return null;
}

export function forgetPrograms() {
  cache.clear();
}
