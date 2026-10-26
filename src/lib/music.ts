// The music player: your library (folders the desktop's server scans), internet radio, one queue,
// and a Web Audio chain (volume → analyser) that the visualizers and the characters' "listening" read.

import { create } from "zustand";
import { desk, useDesk } from "./store.ts";
import { outbound } from "./outbound.ts";
import { allowed, blockedBecause } from "./privacy.ts";
import { speech } from "./voice.ts";

export type { MusicPrefs, Station } from "./musicPrefs.ts";
import type { Station } from "./musicPrefs.ts";
export type Item = ({ kind: "track" } & Track) | ({ kind: "radio" } & Station);
export type Track = { id: string; title: string; artist: string; album: string; year: number; track: number; genre: string; duration: number; cover: boolean; bitrate: number; size: number; folder: string; comment?: string };

type Runtime = {
  tracks: Track[];
  own: string;
  loaded: boolean;
  scanning: string;
  queue: Item[];
  index: number;
  playing: boolean;
  position: number;
  duration: number;
  error: string;
};

export const useMusic = create<Runtime>(() => ({ tracks: [], own: "", loaded: false, scanning: "", queue: [], index: -1, playing: false, position: 0, duration: 0, error: "" }));
const mu = () => useMusic.getState();
const prefs = () => desk().music;
const setPrefs = (p: Partial<import("./musicPrefs.ts").MusicPrefs>) => desk().set({ music: { ...desk().music, ...p } });

// ---------- the sound chain ----------

let audio: HTMLAudioElement | null = null;
let ctx: AudioContext | null = null;
let gain: GainNode | null = null;
let analyser: AnalyserNode | null = null;
let ducked = false;

function element(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "auto";
  audio.crossOrigin = "anonymous";
  audio.addEventListener("timeupdate", () => useMusic.setState({ position: audio!.currentTime, duration: Number.isFinite(audio!.duration) ? audio!.duration : 0 }));
  audio.addEventListener("play", () => useMusic.setState({ playing: true, error: "" }));
  audio.addEventListener("pause", () => useMusic.setState({ playing: false }));
  audio.addEventListener("ended", () => void next(true));
  audio.addEventListener("error", () => {
    const cur = current();
    useMusic.setState({ playing: false, error: cur?.kind === "radio" ? `${cur.name} isn't answering.` : "That file couldn't be played (its format may not be supported by this browser)." });
  });
  return audio;
}

/** Web Audio starts on the first play (browsers only allow it after a click). */
function chain() {
  if (ctx) return;
  ctx = new AudioContext();
  const src = ctx.createMediaElementSource(element());
  gain = ctx.createGain();
  analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;
  src.connect(gain);
  gain.connect(analyser);
  analyser.connect(ctx.destination);
  applyVolume();
}

export const audioGraph = () => ({ ctx, analyser, gain, source: gain });

function applyVolume() {
  const v = prefs().volume * (ducked && prefs().duck ? 0.3 : 1);
  if (gain && ctx) gain.gain.setTargetAtTime(v, ctx.currentTime, 0.25);
  else if (audio) audio.volume = v;
}

// lower the music while a character speaks; follow the volume setting
speech.subscribe(() => {
  const now = Boolean(speech.get().who);
  if (now !== ducked) {
    ducked = now;
    applyVolume();
  }
});
useDesk.subscribe((s, p) => {
  if (s.music?.volume !== p.music?.volume || s.music?.duck !== p.music?.duck) applyVolume();
});

// ---------- library ----------

export async function loadLibrary() {
  const r = await fetch("/api/music/library");
  const j = (await r.json()) as { tracks: Track[]; own: string };
  useMusic.setState({ tracks: j.tracks.sort(byAlbum), own: j.own, loaded: true });
}

export async function scan(folders = prefs().folders) {
  useMusic.setState({ scanning: "Reading your music…" });
  try {
    const r = await fetch("/api/music/scan", { method: "POST", body: JSON.stringify({ folders }) });
    const j = (await r.json()) as { tracks: number; read: number; failed: number };
    await loadLibrary();
    return j;
  } finally {
    useMusic.setState({ scanning: "" });
  }
}

export async function addFiles(files: File[]) {
  for (const [i, f] of files.entries()) {
    useMusic.setState({ scanning: `Adding ${i + 1} of ${files.length}: ${f.name}` });
    const r = await fetch("/api/music/upload", { method: "POST", headers: { "x-filename": encodeURIComponent(f.name) }, body: f });
    if (!r.ok) desk().say(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `Couldn't add ${f.name}.`);
  }
  return scan();
}

function byAlbum(a: Track, b: Track) {
  return (a.artist || "~").localeCompare(b.artist || "~") || (a.album || "~").localeCompare(b.album || "~") || a.track - b.track || a.title.localeCompare(b.title);
}

export function searchLibrary(q: string, limit = 200): Track[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return mu().tracks.slice(0, limit);
  return mu()
    .tracks.filter((t) => {
      const hay = `${t.title} ${t.artist} ${t.album} ${t.genre} ${t.year || ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .slice(0, limit);
}

// ---------- radio ----------

/** Stations from radio-browser.info (a free, open directory), through the chosen connection method. */
export async function findStations(q: string, by: "name" | "tag" | "country" = "name"): Promise<Station[]> {
  if (!allowed(desk().privacy, "web")) throw new Error(blockedBecause(desk().privacy, "web"));
  const params = new URLSearchParams({ [by]: q, limit: "40", hidebroken: "true", order: "clickcount", reverse: "true" });
  const r = await outbound(`https://de1.api.radio-browser.info/json/stations/search?${params}`, { headers: { "User-Agent": "PandoraDeeDesktop/3.4" } }, desk().net.via);
  if (!r.ok) throw new Error(`The radio directory answered ${r.status}.`);
  const rows = (await r.json()) as { name: string; url_resolved?: string; url: string; favicon?: string; tags?: string; country?: string; codec?: string; bitrate?: number; homepage?: string }[];
  return rows.map((x) => ({ name: x.name.trim(), url: x.url_resolved || x.url, favicon: x.favicon || undefined, tags: x.tags, country: x.country, codec: x.codec, bitrate: x.bitrate, homepage: x.homepage }));
}

export function saveStation(st: Station) {
  if (prefs().stations.some((x) => x.url === st.url)) return;
  setPrefs({ stations: [...prefs().stations, st] });
}
export function forgetStation(url: string) {
  setPrefs({ stations: prefs().stations.filter((x) => x.url !== url) });
}

// ---------- playing ----------

export const current = (): Item | undefined => mu().queue[mu().index];
const srcOf = (it: Item) => (it.kind === "track" ? `/api/music/file?id=${it.id}` : `/api/music/radio?url=${encodeURIComponent(it.url)}`);
export const coverOf = (it?: Item) => (!it ? "" : it.kind === "track" ? (it.cover ? `/api/music/cover?id=${it.id}` : "") : it.favicon ?? "");
export const label = (it?: Item) => (!it ? "" : it.kind === "track" ? `${it.title}${it.artist ? ` · ${it.artist}` : ""}` : it.name);

const listeners = new Set<(it: Item) => void>();
/** Something to do whenever a new song or station starts (the characters' comments). */
export function onStart(fn: (it: Item) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function start(i: number) {
  const it = mu().queue[i];
  if (!it) return;
  if (it.kind === "radio" && !allowed(desk().privacy, "web")) {
    useMusic.setState({ error: blockedBecause(desk().privacy, "web") });
    return;
  }
  chain();
  await ctx?.resume();
  const a = element();
  useMusic.setState({ index: i, position: 0, duration: it.kind === "track" ? it.duration : 0, error: "" });
  a.src = srcOf(it);
  applyVolume();
  try {
    await a.play();
  } catch {
    /* the error event explains */
  }
  mediaSession(it);
  for (const fn of listeners) fn(it);
}

/** Play these (a list, an album, a station), starting at `at`. */
export function playList(items: Item[], at = 0) {
  let list = items;
  let first = at;
  if (prefs().shuffle && items.length > 1) {
    const pick = items[at];
    list = [pick, ...items.filter((_, i) => i !== at).sort(() => Math.random() - 0.5)];
    first = 0;
  }
  useMusic.setState({ queue: list });
  void start(first);
}

export function enqueue(items: Item[]) {
  const q = mu().queue;
  useMusic.setState({ queue: [...q, ...items] });
  if (mu().index < 0) void start(q.length);
}

export function toggle() {
  const a = element();
  if (mu().index < 0) {
    const all = mu().tracks.map((t) => ({ kind: "track", ...t }) as Item);
    if (all.length) playList(all, prefs().shuffle ? Math.floor(Math.random() * all.length) : 0);
    return;
  }
  chain();
  void ctx?.resume();
  if (a.paused) void a.play();
  else a.pause();
}

export function pause() {
  audio?.pause();
}

export async function next(auto = false) {
  const { queue, index } = mu();
  if (!queue.length) return;
  if (auto && prefs().repeat === "one") return start(index);
  if (index + 1 < queue.length) return start(index + 1);
  if (prefs().repeat === "all" || !auto) return start(0);
  useMusic.setState({ playing: false });
}

export function previous() {
  const a = element();
  if (a.currentTime > 4) {
    a.currentTime = 0;
    return;
  }
  const { queue, index } = mu();
  if (queue.length) void start((index - 1 + queue.length) % queue.length);
}

export function seek(seconds: number) {
  const a = element();
  if (Number.isFinite(a.duration)) a.currentTime = Math.max(0, Math.min(a.duration, seconds));
}

export function stop() {
  if (!audio) return;
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  useMusic.setState({ playing: false, index: -1, position: 0 });
}

/** The keyboard's media keys and the system's "now playing". */
function mediaSession(it: Item) {
  const ms = navigator.mediaSession;
  if (!ms) return;
  const art = coverOf(it);
  ms.metadata = new MediaMetadata({
    title: it.kind === "track" ? it.title : it.name,
    artist: it.kind === "track" ? it.artist : "Internet radio",
    album: it.kind === "track" ? it.album : it.country ?? "",
    artwork: art ? [{ src: art }] : [],
  });
  ms.setActionHandler("play", () => toggle());
  ms.setActionHandler("pause", () => pause());
  ms.setActionHandler("nexttrack", () => void next());
  ms.setActionHandler("previoustrack", () => previous());
}

// ---------- listening ----------

/**
 * A short listen: how loud, how bright, and a rough tempo, so a character can say something about the
 * sound itself. Takes about `seconds` while the music plays.
 */
export async function listen(seconds = 8): Promise<{ loudness: string; brightness: string; tempo: number } | null> {
  if (!analyser || !ctx || audio?.paused) return null;
  const a = analyser;
  const freq = new Uint8Array(a.frequencyBinCount);
  const wave = new Uint8Array(a.fftSize);
  const energies: number[] = [];
  let rmsSum = 0;
  let centroidSum = 0;
  let n = 0;
  const end = performance.now() + seconds * 1000;
  while (performance.now() < end) {
    a.getByteTimeDomainData(wave);
    a.getByteFrequencyData(freq);
    let s = 0;
    for (const v of wave) s += ((v - 128) / 128) ** 2;
    const rms = Math.sqrt(s / wave.length);
    let num = 0;
    let den = 0;
    freq.forEach((v, i) => ((num += v * i), (den += v)));
    rmsSum += rms;
    centroidSum += den ? num / den : 0;
    energies.push(rms);
    n++;
    await new Promise((r) => setTimeout(r, 20));
  }
  if (!n || rmsSum / n < 0.005) return null;
  // tempo: the most common gap between energy peaks (50 frames a second)
  const peaks: number[] = [];
  const mean = energies.reduce((x, y) => x + y, 0) / energies.length;
  for (let i = 1; i < energies.length - 1; i++) if (energies[i] > mean * 1.25 && energies[i] > energies[i - 1] && energies[i] >= energies[i + 1]) peaks.push(i);
  const gaps = peaks.slice(1).map((p, i) => p - peaks[i]).filter((g) => g >= 15 && g <= 75);
  const counts = new Map<number, number>();
  for (const g of gaps) counts.set(g, (counts.get(g) ?? 0) + 1);
  const best = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
  const tempo = best ? Math.round((60 * 50) / best) : 0;
  const rms = rmsSum / n;
  const centroidHz = ((centroidSum / n) * (ctx.sampleRate / 2)) / freq.length;
  return {
    loudness: rms > 0.25 ? "loud and full" : rms > 0.12 ? "moderately loud" : "soft",
    brightness: centroidHz > 3000 ? "bright, lots of treble" : centroidHz > 1500 ? "balanced" : "dark and bass-heavy",
    tempo,
  };
}

export function nowPlayingText(): string {
  const it = current();
  if (!it) return "Nothing is playing.";
  const st = mu();
  const pos = `${Math.floor(st.position / 60)}:${String(Math.floor(st.position % 60)).padStart(2, "0")}`;
  if (it.kind === "radio") return `${st.playing ? "Playing" : "Paused"}: the radio station ${it.name}${it.country ? ` (${it.country})` : ""}${it.tags ? `, ${it.tags}` : ""}.`;
  return `${st.playing ? "Playing" : "Paused"}: "${it.title}"${it.artist ? ` by ${it.artist}` : ""}${it.album ? `, from ${it.album}` : ""}${it.year ? ` (${it.year})` : ""}${it.genre ? `, ${it.genre}` : ""}, at ${pos}${it.duration ? ` of ${Math.floor(it.duration / 60)}:${String(it.duration % 60).padStart(2, "0")}` : ""}.`;
}
