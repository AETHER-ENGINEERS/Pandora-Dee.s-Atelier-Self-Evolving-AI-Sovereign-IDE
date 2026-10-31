// Media Theater's side of the desktop: the video library (server/theater.mjs), backing videos up from a phone in
// checked pieces that carry on after a dropped connection, thumbnails made by whichever page can play the video,
// and where each video was left off (kept per device).

import { useSyncExternalStore } from "react";
import { rawUrl } from "./explorer.ts";

export type Video = { id: string; path: string; name: string; ext: string; shelf: string; size: number; mtime: number; seconds: number; thumb: 1 | 0 | -1; fav: boolean };
export type Library = { root: string; shelves: string[]; videos: Video[] };

async function call<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `It answered ${r.status}.`);
  return j as T;
}

// ---- the library ----

let lib: Library | null = null;
let loading: Promise<void> | null = null;
let libError = "";
const libListeners = new Set<() => void>();
const libChanged = () => libListeners.forEach((fn) => fn());

export function refreshLibrary(): Promise<void> {
  return (loading ??= call<Library>("/api/theater/list")
    .then((l) => {
      lib = l;
      libError = "";
    })
    .catch((e) => {
      libError = e instanceof Error ? e.message : String(e);
    })
    .finally(() => {
      loading = null;
      libChanged();
    }));
}

export function useLibrary(): { lib: Library | null; error: string } {
  const l = useSyncExternalStore(
    (fn) => (libListeners.add(fn), () => libListeners.delete(fn)),
    () => lib,
  );
  return { lib: l, error: libError };
}

export const theaterApi = {
  fav: (id: string, on: boolean) => call<{ fav: boolean }>("/api/theater/fav", { id, on }),
  move: (path: string, shelf: string) => call<{ path: string }>("/api/theater/move", { path, shelf }),
  shelf: (name: string) => call<{ shelf: string }>("/api/theater/shelf", { name }),
  have: (items: { name: string; size: number }[]) => call<{ have: (string | null)[] }>("/api/theater/have", { items }),
};

export const thumbUrl = (id: string) => `/api/theater/thumb?id=${encodeURIComponent(id)}`;
export const videoUrl = (v: Video) => rawUrl(v.path);

/** Change one video in the list straight away (the server already has it). */
export function patchVideo(id: string, patch: Partial<Video>) {
  if (!lib) return;
  lib = { ...lib, videos: lib.videos.map((v) => (v.id === id ? { ...v, ...patch } : v)) };
  libChanged();
}

// ---- thumbnails ----

const triedThumbs = new Set<string>();
let thumbRunning = false;

/** A still from the video and its length, made here and kept on the desktop for every device. One at a time. */
export async function makeThumbs(videos: Video[]) {
  if (thumbRunning) return;
  thumbRunning = true;
  try {
    for (const v of videos) {
      if (v.thumb !== 0 || triedThumbs.has(v.id)) continue;
      triedThumbs.add(v.id);
      const got = await still(videoUrl(v)).catch(() => null);
      if (got === null) continue; // too slow this time: try again another day
      const r = await fetch(`/api/theater/thumb?id=${encodeURIComponent(v.id)}&seconds=${got.seconds}`, { method: "POST", body: got.jpeg ?? new Blob([]) });
      if (r.ok) patchVideo(v.id, { thumb: got.jpeg ? 1 : -1, seconds: got.seconds || v.seconds });
    }
  } finally {
    thumbRunning = false;
  }
}

/** A JPEG from a little way in, or `jpeg: null` when this browser can't play the video at all. */
function still(src: string): Promise<{ jpeg: Blob | null; seconds: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "metadata";
    v.playsInline = true;
    const done = (out: { jpeg: Blob | null; seconds: number } | null) => {
      clearTimeout(timer);
      v.removeAttribute("src");
      v.load();
      if (out) resolve(out);
      else reject(new Error("slow"));
    };
    const timer = setTimeout(() => done(null), 25_000);
    v.onerror = () => done({ jpeg: null, seconds: 0 });
    v.onloadedmetadata = () => {
      const d = Number.isFinite(v.duration) ? v.duration : 0;
      v.currentTime = Math.min(1.5, d * 0.1);
    };
    v.onseeked = () => {
      const d = Number.isFinite(v.duration) ? v.duration : 0;
      if (!v.videoWidth) return done({ jpeg: null, seconds: d });
      const w = 360, h = Math.round((v.videoHeight / v.videoWidth) * w);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d")?.drawImage(v, 0, 0, w, h);
      c.toBlob((b) => done({ jpeg: b, seconds: d }), "image/jpeg", 0.75);
    };
    v.src = src;
  });
}

// ---- where each video was left off, on this device ----

const POS_KEY = "pdd-theater-pos";
function positions(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(POS_KEY) || "{}");
  } catch {
    return {};
  }
}
export const leftOff = (id: string) => positions()[id] ?? 0;
export function rememberPosition(id: string, at: number, length: number) {
  const all = positions();
  // the very start and the last few seconds count as "not started" and "finished"
  if (at < 8 || (length && at > length - 8)) delete all[id];
  else all[id] = Math.round(at);
  const keys = Object.keys(all);
  if (keys.length > 300) for (const k of keys.slice(0, keys.length - 300)) delete all[k];
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(all));
  } catch {
    /* private mode: it just won't remember */
  }
}

// ---- backing up from this device ----

export type Job = {
  key: string;
  file: File;
  shelf: string;
  state: "checking" | "waiting" | "sending" | "done" | "kept" | "failed";
  sent: number;
  error?: string;
  /** where it's kept on the desktop */
  path?: string;
};

const PIECE = 8 * 1024 * 1024;
let jobs: Job[] = [];
const jobListeners = new Set<() => void>();
const jobsChanged = () => {
  jobs = [...jobs];
  jobListeners.forEach((fn) => fn());
};
const setJob = (j: Job, patch: Partial<Job>) => {
  Object.assign(j, patch);
  jobsChanged();
};

export function useJobs(): Job[] {
  return useSyncExternalStore(
    (fn) => (jobListeners.add(fn), () => jobListeners.delete(fn)),
    () => jobs,
  );
}

export const isVideoFile = (f: File) => f.type.startsWith("video/") || /\.(mp4|m4v|mov|webm|mkv|3gp|avi|ogv)$/i.test(f.name);

/** Back these up onto a shelf. Ones the desktop already has are marked kept straight away. */
export async function backUp(files: File[], shelf: string) {
  const fresh: Job[] = files.filter(isVideoFile).map((file) => ({ key: `${file.name}\u0000${file.size}\u0000${Math.random()}`, file, shelf, state: "checking", sent: 0 }));
  if (!fresh.length) return 0;
  jobs = [...jobs, ...fresh];
  jobsChanged();
  try {
    const { have } = await theaterApi.have(fresh.map((j) => ({ name: j.file.name, size: j.file.size })));
    fresh.forEach((j, i) => setJob(j, have[i] ? { state: "kept", sent: j.file.size, path: have[i]! } : { state: "waiting" }));
  } catch {
    fresh.forEach((j) => setJob(j, { state: "waiting" }));
  }
  void run();
  return fresh.length;
}

export function clearFinished() {
  jobs = jobs.filter((j) => !["done", "kept"].includes(j.state));
  jobsChanged();
}

export function cancelJob(j: Job) {
  jobs = jobs.filter((x) => x !== j);
  jobsChanged();
  const q = new URLSearchParams({ shelf: j.shelf, name: j.file.name, size: String(j.file.size) });
  if (j.state !== "done" && j.state !== "kept") void fetch(`/api/theater/upload?${q}`, { method: "DELETE" }).catch(() => {});
}

export function retryJob(j: Job) {
  setJob(j, { state: "waiting", error: undefined });
  void run();
}

let running = false;
let lock: { release: () => Promise<void> } | null = null;

async function run() {
  if (running) return;
  running = true;
  // keep the phone's screen on while it sends, or it stops halfway when the screen goes dark
  try {
    lock = (await (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen")) ?? null;
  } catch {
    lock = null;
  }
  try {
    let j: Job | undefined;
    while ((j = jobs.find((x) => x.state === "waiting"))) await send(j);
  } finally {
    running = false;
    void lock?.release().catch(() => {});
    lock = null;
    void refreshLibrary();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sha256(b: ArrayBuffer): Promise<string> {
  // crypto.subtle needs the secure (https) address; over plain http the desktop takes the piece unchecked
  if (!crypto.subtle) return "";
  const d = await crypto.subtle.digest("SHA-256", b);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function send(j: Job) {
  const f = j.file;
  const base = { shelf: j.shelf, name: f.name, size: String(f.size), modified: String(f.lastModified || "") };
  setJob(j, { state: "sending", error: undefined });
  let tries = 0;
  for (;;) {
    if (!jobs.includes(j)) return; // cancelled
    try {
      const st = await fetch(`/api/theater/upload?${new URLSearchParams(base)}`).then((r) => r.json() as Promise<{ have: number }>);
      let at = st.have;
      setJob(j, { sent: at });
      while (at < f.size) {
        if (!jobs.includes(j)) return;
        const piece = await f.slice(at, Math.min(f.size, at + PIECE)).arrayBuffer();
        const sum = await sha256(piece);
        const r = await fetch(`/api/theater/upload?${new URLSearchParams({ ...base, offset: String(at) })}`, { method: "POST", headers: sum ? { "X-Sha256": sum } : {}, body: piece });
        const res = (await r.json().catch(() => ({}))) as { have?: number; done?: boolean; path?: string; error?: string };
        if (r.status === 422) continue; // damaged on the way: the same piece again
        if (!r.ok) throw Object.assign(new Error(res.error || `The desktop answered ${r.status}.`), { final: r.status < 500 });
        at = res.have ?? at;
        tries = 0;
        setJob(j, { sent: at });
        if (res.done) return setJob(j, { state: "done", path: res.path });
      }
      return;
    } catch (e) {
      const err = e as Error & { final?: boolean };
      if (err.final || ++tries > 30) return setJob(j, { state: "failed", error: err.message || "It stopped." });
      // Wi-Fi dropped or the desktop restarted: wait, then carry on from what arrived
      setJob(j, { error: `Connection lost; trying again (${tries})…` });
      await sleep(Math.min(20_000, 2000 * tries));
    }
  }
}

export const sizeText = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${Math.round(n / 1e6)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
export const lengthText = (s: number) => {
  if (!s) return "";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};
