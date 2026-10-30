// Explorer's side of the desktop: the file API (server/files.mjs), and what other apps use to send people to
// a file (show it in Explorer, save it to the device they're on, open a Mini App in Games & Apps) or to ask
// them for one (the picker, which Vector's window uses for its file and folder dialogs).

import { useSyncExternalStore } from "react";
import { desk } from "./store.ts";
import { library } from "./xdc.ts";

export type Entry = { name: string; path: string; dir: boolean; size: number; mtime: number; ext: string };
export type Place = { id: string; name: string; path: string; kind: string };
export type Overview = {
  places: Place[];
  wholePc: { on: boolean; local: boolean; drives: Place[] };
  deviceExplorer: boolean;
  /** shared with the other devices on the network (only the computer itself can change it) */
  sharing: { wholePc: boolean; folders: Place[]; canChange: boolean };
  /** shared by other devices (phones, other computers) while their page is open: paths start with "device:" */
  devices?: Place[];
};
export type Listing = { path: string; parent: string | null; entries: Entry[] };
export type Trashed = { id: string; from: string; name: string; at: number };

async function call<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `It answered ${r.status}.`);
  return j as T;
}
const q = (p: string) => encodeURIComponent(p);

export const fileApi = {
  overview: () => call<Overview>("/api/files/places"),
  list: (p: string) => call<Listing>(`/api/files/list?path=${q(p)}`),
  stat: (p: string) => call<Entry & { ctime: number }>(`/api/files/stat?path=${q(p)}`),
  trashList: () => call<Trashed[]>("/api/files/trash"),
  mkdir: (p: string, name: string) => call<{ path: string }>("/api/files/mkdir", { path: p, name }),
  rename: (p: string, name: string) => call<{ path: string }>("/api/files/move", { path: p, name }),
  moveInto: (p: string, into: string) => call<{ path: string }>("/api/files/move", { path: p, into }),
  trash: (p: string) => call<{ id: string }>("/api/files/trash", { path: p }),
  restore: (id: string) => call<{ path: string }>("/api/files/restore", { id }),
  revealOnDevice: (p: string) => call<{ ok: true }>("/api/files/reveal-device", { path: p }),
  setWholePc: (on: boolean) => call<Overview>("/api/files/whole-pc", { on }),
  share: (p: string, on: boolean) => call<Overview>("/api/files/share", { path: p, on }),
  shareWholePc: (on: boolean) => call<Overview>("/api/files/share", { wholePc: on }),
  importXdc: (p: string) => call<{ id: string | null; added: number; errors: string[] }>("/api/files/import-xdc", { path: p }),
  async upload(dir: string, file: File): Promise<string> {
    const r = await fetch(`/api/files/upload?dir=${q(dir)}`, { method: "POST", headers: { "X-Filename": encodeURIComponent(file.name) }, body: file });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j as { error?: string }).error || `Upload failed (${r.status}).`);
    return (j as { path: string }).path;
  },
};

export const rawUrl = (p: string, download = false) => `/api/files/raw?path=${q(p)}${download ? "&download=1" : ""}`;
export const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;
export const dirName = (p: string) => p.replace(/[\\/][^\\/]*[\\/]?$/, "") || p;

/** A copy saved on the device being used (the phone, or this computer's Downloads). */
export function downloadToDevice(p: string) {
  const a = document.createElement("a");
  a.href = rawUrl(p, true);
  a.download = baseName(p);
  document.body.append(a);
  a.click();
  a.remove();
}

/** Opens Explorer at a file (selected) or a folder, inside the desktop. */
export function showInExplorer(p: string) {
  const go = { path: p, at: Date.now() };
  sessionStorage.setItem("pdd-explorer-go", JSON.stringify(go));
  window.dispatchEvent(new CustomEvent("pdd-explorer", { detail: go }));
  desk().openApp("explorer");
}

/** The computer's own file manager at that file (only works on the computer running the desktop). */
export function showOnDevice(p: string) {
  return fileApi.revealOnDevice(p).catch((e: Error) => desk().say(e.message));
}

/** A Mini App (.xdc) into Games & Apps' Vector apps, then opened there. */
export async function openXdcInGames(p: string) {
  const r = await fileApi.importXdc(p);
  if (r.errors?.length && !r.id) throw new Error(r.errors[0]);
  const pkg = (await library.list()).find((x) => x.id === r.id);
  if (!pkg) throw new Error("It didn't arrive in Games & Apps.");
  desk().set({ game: { kind: "xdc", slug: pkg.appKey, title: pkg.name, players: [], pkgId: pkg.id, scope: pkg.appKey } });
  desk().openApp("games");
  return { added: r.added > 0, name: pkg.name };
}

// ── the picker: Explorer as a file / folder / save-as dialog ────────────────────────────────────────────
export type PickOptions = {
  mode: "open" | "folder" | "save";
  multiple?: boolean;
  filters?: { name?: string; extensions: string[] }[];
  defaultName?: string;
  title?: string;
};
type PickRequest = PickOptions & { id: number; resolve: (paths: string[] | null) => void };

let request: PickRequest | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

/** Asks for files, a folder, or where to save (paths on the computer running the desktop), or null. */
export function pickInExplorer(opts: PickOptions): Promise<string[] | null> {
  request?.resolve(null);
  return new Promise((resolve) => {
    request = { ...opts, id: ++seq, resolve };
    emit();
  });
}
export function answerPick(paths: string[] | null) {
  const r = request;
  request = null;
  emit();
  r?.resolve(paths);
}
export function usePickRequest() {
  return useSyncExternalStore(
    (f) => (listeners.add(f), () => listeners.delete(f)),
    () => request,
  );
}

// ── kinds of file, for previews and "open" ──────────────────────────────────────────────────────────────
export const KIND = {
  image: new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "bmp", "apng", "ico"]),
  audio: new Set(["mp3", "wav", "ogg", "opus", "flac", "m4a", "aac"]),
  video: new Set(["mp4", "webm", "mov", "m4v", "mkv"]),
  text: new Set(["txt", "md", "markdown", "json", "js", "mjs", "ts", "tsx", "css", "html", "htm", "xml", "csv", "log", "ini", "toml", "yml", "yaml", "py", "sh", "bat", "ps1", "rs", "c", "h", "cpp", "java", "go", "srt", "vtt"]),
};
export const kindOf = (e: { ext: string; dir: boolean }) =>
  e.dir ? "folder" : KIND.image.has(e.ext) ? "image" : KIND.audio.has(e.ext) ? "audio" : KIND.video.has(e.ext) ? "video" : e.ext === "pdf" ? "pdf" : e.ext === "xdc" ? "xdc" : KIND.text.has(e.ext) ? "text" : "file";

export function sizeOf(n: number) {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let i = -1;
  do {
    n /= 1024;
    i++;
  } while (n >= 1024 && i < u.length - 1);
  return `${n < 10 ? n.toFixed(1) : Math.round(n)} ${u[i]}`;
}
