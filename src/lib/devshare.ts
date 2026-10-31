// This device sharing its own files with the desktop's other devices (server/devshare.mjs): a folder (Chrome and
// Edge on computers) or picked files (anywhere, phones too). Nothing is copied: while this page is open it answers
// when someone opens the share in Explorer, and the share ends when the page closes or "Stop" is pressed.

import { useSyncExternalStore } from "react";
import { desk } from "./store.ts";

type DirHandle = FileSystemDirectoryHandle & { values(): AsyncIterable<FileSystemHandle> };
type Source = { kind: "folder"; dir: DirHandle } | { kind: "files"; files: File[] };
export type MyShare = { id: string; token: string; name: string; kind: "folder" | "files"; count?: number };

const mine = new Map<string, MyShare & { src: Source; stop: boolean }>();
let snapshot: MyShare[] = [];
const listeners = new Set<() => void>();
const emit = () => {
  snapshot = [...mine.values()].map(({ id, token, name, kind, count }) => ({ id, token, name, kind, count }));
  listeners.forEach((f) => f());
};

export const canShareFolder = () => typeof (window as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";

/** What other devices see this one called: who's signed in, and what kind of device it is. */
export function deviceName() {
  const ua = navigator.userAgent;
  const kind = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? (/Mobile/.test(ua) ? "Android phone" : "Android tablet") : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows PC" : /Linux/.test(ua) ? "Linux PC" : "device";
  const who = desk().session;
  return who ? `${who}'s ${kind}` : kind;
}

async function walk(src: Source, rel: string): Promise<{ dir?: DirHandle; file?: File }> {
  const parts = rel.split("/").filter(Boolean);
  if (src.kind === "files") {
    if (!parts.length) return {};
    const f = src.files.find((x) => x.name === parts.join("/"));
    if (!f) throw new Error("That file isn't shared any more.");
    return { file: f };
  }
  let dir = src.dir;
  for (let i = 0; i < parts.length; i++) {
    const last = i === parts.length - 1;
    try {
      dir = (await dir.getDirectoryHandle(parts[i])) as DirHandle;
    } catch {
      if (!last) throw new Error("That folder isn't there any more.");
      return { file: await (await dir.getFileHandle(parts[i])).getFile() };
    }
  }
  return { dir };
}

async function answer(s: MyShare & { src: Source }, r: { rid: string; op: string; path: string; range?: string }) {
  const at = `/api/devshare/reply?id=${s.id}&token=${s.token}&rid=${encodeURIComponent(r.rid)}`;
  try {
    const hit = await walk(s.src, r.path);
    if (r.op === "raw") {
      if (!hit.file) throw new Error("That's a folder.");
      const f = hit.file;
      const type = f.type || "application/octet-stream";
      // a byte range (a video being sought): just those bytes, and which ones they are
      const m = r.range ? /^bytes=(\d*)-(\d*)$/.exec(r.range) : null;
      if (m && f.size) {
        const start = m[1] ? Number(m[1]) : Math.max(0, f.size - Number(m[2]));
        const end = m[1] && m[2] ? Math.min(Number(m[2]), f.size - 1) : f.size - 1;
        const part = start <= end ? f.slice(start, end + 1) : new Blob([]);
        await fetch(at, { method: "POST", headers: { "Content-Type": type, "X-Size": String(f.size), "X-Start": String(start), "X-End": String(end) }, body: part });
        return;
      }
      await fetch(at, { method: "POST", headers: { "Content-Type": type }, body: f });
      return;
    }
    let entries: { name: string; dir: boolean; size: number; mtime: number }[] = [];
    if (s.src.kind === "files" && !r.path) entries = s.src.files.map((f) => ({ name: f.name, dir: false, size: f.size, mtime: f.lastModified }));
    else if (hit.dir) {
      for await (const h of hit.dir.values()) {
        if (h.kind === "directory") entries.push({ name: h.name, dir: true, size: 0, mtime: 0 });
        else {
          try {
            const f = await (h as FileSystemFileHandle).getFile();
            entries.push({ name: h.name, dir: false, size: f.size, mtime: f.lastModified });
          } catch {
            /* a file the browser won't open (a system file): left out */
          }
        }
      }
    } else throw new Error("That's a file, not a folder.");
    await fetch(at, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries }) });
  } catch (e) {
    await fetch(at, { method: "POST", headers: { "X-Error": encodeURIComponent(e instanceof Error ? e.message : String(e)) } }).catch(() => {});
  }
}

async function serve(s: MyShare & { src: Source; stop: boolean }) {
  let fails = 0;
  while (!s.stop) {
    try {
      const r = await fetch(`/api/devshare/next?id=${s.id}&token=${s.token}`, { cache: "no-store" });
      if (r.status === 404) break; // the desktop forgot it (restarted): this share is over
      fails = 0;
      if (r.status === 200) void answer(s, await r.json());
    } catch {
      if (++fails > 20) break;
      await new Promise((x) => setTimeout(x, 1500));
    }
  }
  if (mine.delete(s.id)) {
    emit();
    if (!s.stop) desk().say(`"${s.name}" stopped being shared: the desktop couldn't be reached.`);
  }
}

async function start(name: string, src: Source) {
  const r = await fetch("/api/devshare/open", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, device: deviceName(), kind: src.kind }) });
  const j = (await r.json()) as { id?: string; token?: string; error?: string };
  if (!j.id || !j.token) throw new Error(j.error || "The desktop didn't open the share.");
  const s = { id: j.id, token: j.token, name, kind: src.kind, count: src.kind === "files" ? src.files.length : undefined, src, stop: false };
  mine.set(s.id, s);
  emit();
  void serve(s);
  return s;
}

/** Ask for a folder on this device and share it (Chrome / Edge). Null if they changed their mind. */
export async function shareFolder() {
  let dir: DirHandle;
  try {
    dir = (await (window as unknown as { showDirectoryPicker: (o: object) => Promise<DirHandle> }).showDirectoryPicker({ mode: "read" })) as DirHandle;
  } catch {
    return null;
  }
  return start(dir.name, { kind: "folder", dir });
}

/** Share files this device picked. */
export function shareFiles(files: File[]) {
  if (!files.length) return Promise.resolve(null);
  return start(files.length === 1 ? files[0].name : `${files.length} files`, { kind: "files", files });
}

export function stopSharing(id: string) {
  const s = mine.get(id);
  if (!s) return;
  s.stop = true;
  mine.delete(id);
  emit();
  void fetch("/api/devshare/close", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: s.id, token: s.token }) }).catch(() => {});
}

// the page going away ends its shares right away, not after the server notices the silence
window.addEventListener("pagehide", () => {
  for (const s of mine.values()) navigator.sendBeacon?.("/api/devshare/close", new Blob([JSON.stringify({ id: s.id, token: s.token })], { type: "application/json" }));
});

export function useMyShares() {
  return useSyncExternalStore(
    (f) => (listeners.add(f), () => listeners.delete(f)),
    () => snapshot,
  );
}
