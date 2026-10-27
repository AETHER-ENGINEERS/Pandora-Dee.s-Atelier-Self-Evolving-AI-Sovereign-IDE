// Making pictures and songs with engines you run (usually on another computer on your network, like a Mac with
// the models): ComfyUI, Automatic1111-style servers (Draw Things, Forge, SD.Next) and OpenAI-style image APIs for
// pictures; ACE-Step 1.5's API and YuE2 (through ComfyUI, with the official workflow) for songs. Requests go
// through the desktop's relay, so the other computer needs no browser settings. Results land in the vault
// (pictures) and the music library (songs).

import { desk } from "./store.ts";
import { outbound } from "./outbound.ts";
import { scopeOf } from "./model.ts";
import { allowed, blockedBecause, type Feature } from "./privacy.ts";
import { scan } from "./music.ts";
import type { ImageEngine, MadeSong, SongEngine } from "./mediaPrefs.ts";
import yue2Workflow from "./workflows/yue2-text2music.json";
import { parseSong } from "./songText.ts";

export type PictureAsk = { prompt: string; negative?: string; width: number; height: number; seed?: number; count?: number };
export type SongAsk = { title: string; style: string; lyrics: string; seconds: number; seed?: number; instrumental?: boolean };
export type Progress = (text: string) => void;

const trim = (u: string) => u.trim().replace(/\/+$/, "");
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((ok, no) => {
    const t = setTimeout(ok, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), no(new DOMException("Stopped", "AbortError"))), { once: true });
  });
const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

/** Whether the privacy settings let the desktop reach this engine, and why not if they don't. */
export function engineAllowed(url: string): string {
  const scope = scopeOf(url);
  if (scope === "device") return "";
  const f: Feature = scope === "network" ? "network-models" : "online-models";
  return allowed(desk().privacy, f) ? "" : blockedBecause(desk().privacy, f);
}

type Engine = { url: string; keyName?: string; via?: import("./outbound.ts").Via; name: string };
function call(e: Engine, path: string, init: { method?: string; body?: unknown; timeout?: number; signal?: AbortSignal } = {}) {
  const why = engineAllowed(e.url);
  if (why) throw new Error(why);
  const key = e.keyName ? desk().env[e.keyName] ?? "" : "";
  const headers: Record<string, string> = { Accept: "*/*" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (key) headers.Authorization = /^Bearer /i.test(key) ? key : `Bearer ${key}`;
  return outbound(`${trim(e.url)}${path}`, { method: init.method ?? (init.body !== undefined ? "POST" : "GET"), headers, body: init.body !== undefined ? JSON.stringify(init.body) : undefined, timeout: init.timeout ?? 120, signal: init.signal }, e.via ?? desk().net.via);
}
async function json<T>(e: Engine, path: string, init: Parameters<typeof call>[2] = {}): Promise<T> {
  const r = await call(e, path, init);
  const text = await r.text();
  if (!r.ok) throw new Error(`${e.name} answered ${r.status}: ${text.replace(/<[^>]+>/g, " ").trim().slice(0, 300) || r.statusText}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${e.name} didn't answer with JSON: ${text.slice(0, 200)}`);
  }
}
async function blob(e: Engine, path: string, signal?: AbortSignal): Promise<Blob> {
  const r = await call(e, path, { timeout: 300, signal });
  if (!r.ok) throw new Error(`${e.name} answered ${r.status} for the file.`);
  return r.blob();
}
const fromB64 = (b64: string, type = "image/png") => {
  const bin = atob(b64.replace(/^data:[^,]+,/, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return new Blob([out], { type });
};

// ---------- ComfyUI (pictures and YuE2) ----------

type ComfyFile = { filename: string; subfolder: string; type: string };
type Workflow = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

/** Queue a workflow and wait for its files (pictures or audio). */
async function runComfy(e: Engine, workflow: Workflow, want: "images" | "audio", progress: Progress, signal?: AbortSignal): Promise<Blob[]> {
  const client_id = crypto.randomUUID();
  const q = await json<{ prompt_id?: string; error?: { message?: string }; node_errors?: Record<string, { errors?: { message: string; details?: string }[] }> }>(e, "/prompt", { body: { prompt: workflow, client_id }, signal });
  if (!q.prompt_id) {
    const nodeErr = Object.values(q.node_errors ?? {}).flatMap((n) => n.errors ?? []).map((x) => `${x.message}${x.details ? ` (${x.details})` : ""}`)[0];
    throw new Error(`ComfyUI didn't take the job: ${nodeErr || q.error?.message || "unknown reason"}`);
  }
  const started = Date.now();
  for (;;) {
    await sleep(2000, signal);
    const h = await json<Record<string, { status?: { status_str?: string; completed?: boolean; messages?: [string, { exception_message?: string }][] }; outputs?: Record<string, Record<string, ComfyFile[]>> }>>(e, `/history/${q.prompt_id}`, { signal });
    const run = h[q.prompt_id];
    if (run?.status?.status_str === "error") {
      const msg = run.status.messages?.find((m) => m[0] === "execution_error")?.[1]?.exception_message;
      throw new Error(`ComfyUI stopped with an error${msg ? `: ${msg.trim()}` : "."}`);
    }
    if (run?.outputs && (run.status?.completed || run.status?.status_str === "success")) {
      const files = Object.values(run.outputs).flatMap((o) => (o[want] ?? []).filter((f) => f.type === "output" || want === "images"));
      if (!files.length) throw new Error(`ComfyUI finished but gave back no ${want === "images" ? "pictures" : "audio"}.`);
      return Promise.all(files.map((f) => blob(e, `/view?${new URLSearchParams({ filename: f.filename, subfolder: f.subfolder, type: f.type })}`, signal)));
    }
    progress(`Working… ${Math.round((Date.now() - started) / 1000)} s`);
  }
}

/** A basic text-to-picture workflow for any Stable Diffusion-style checkpoint. */
function basicWorkflow(ckpt: string, a: PictureAsk, steps: number, seed: number): Workflow {
  return {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: ckpt } },
    "2": { class_type: "CLIPTextEncode", inputs: { text: a.prompt, clip: ["1", 1] } },
    "3": { class_type: "CLIPTextEncode", inputs: { text: a.negative || "", clip: ["1", 1] } },
    "4": { class_type: "EmptyLatentImage", inputs: { width: a.width, height: a.height, batch_size: Math.max(1, Math.min(4, a.count ?? 1)) } },
    "5": { class_type: "KSampler", inputs: { seed, steps, cfg: 6, sampler_name: "euler", scheduler: "normal", denoise: 1, model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0] } },
    "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
    "7": { class_type: "SaveImage", inputs: { filename_prefix: "pandora", images: ["6", 0] } },
  };
}

/** Your own workflow, with the placeholders filled in (as JSON strings or numbers where they stand alone). */
function fillWorkflow(text: string, values: Record<string, string | number>): Workflow {
  const filled = text.replace(/"\{\{(\w+)\}\}"|\{\{(\w+)\}\}/g, (whole, quoted: string | undefined, bare: string | undefined) => {
    const k = (quoted || bare)!;
    if (!(k in values)) return whole;
    const v = values[k];
    if (quoted) return typeof v === "number" ? String(v) : JSON.stringify(v);
    return typeof v === "number" ? String(v) : JSON.stringify(v).slice(1, -1);
  });
  try {
    return JSON.parse(filled) as Workflow;
  } catch {
    throw new Error("The ComfyUI workflow isn't valid JSON. Export it with “Save (API Format)” / “Export (API)” in ComfyUI.");
  }
}

/** What a ComfyUI server has: its checkpoints, and whether the YuE2 nodes are there. */
export async function comfyInfo(e: Engine): Promise<{ checkpoints: string[]; yue2: boolean }> {
  const info = await json<Record<string, { input?: { required?: { ckpt_name?: [string[]] } } }>>(e, "/object_info/CheckpointLoaderSimple");
  const checkpoints = info.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] ?? [];
  let yue2 = false;
  try {
    const y = await json<Record<string, unknown>>(e, "/object_info/YuE2GenerateMusic");
    yue2 = Boolean(y.YuE2GenerateMusic);
  } catch {
    /* no YuE2 nodes */
  }
  return { checkpoints, yue2 };
}

// ---------- pictures ----------

export async function makePictures(e: ImageEngine, a: PictureAsk, progress: Progress, signal?: AbortSignal): Promise<Blob[]> {
  const seed = a.seed ?? randomSeed();
  const count = Math.max(1, Math.min(4, a.count ?? 1));
  progress("Asking…");
  if (e.kind === "openai") {
    const body = { model: e.model || "gpt-image-1", prompt: a.prompt, n: count, size: `${a.width}x${a.height}` };
    let r = await call(e, "/images/generations", { body: { ...body, response_format: "b64_json" }, timeout: 300, signal });
    // some services (gpt-image-1) refuse response_format; they answer with base64 anyway
    if (r.status === 400) r = await call(e, "/images/generations", { body, timeout: 300, signal });
    const text = await r.text();
    if (!r.ok) throw new Error(`${e.name} answered ${r.status}: ${text.slice(0, 300)}`);
    const j = JSON.parse(text) as { data?: { b64_json?: string; url?: string }[] };
    return Promise.all((j.data ?? []).map(async (d) => (d.b64_json ? fromB64(d.b64_json) : (await outbound(d.url!, {}, e.via ?? desk().net.via)).blob())));
  }
  if (e.kind === "a1111") {
    const j = await json<{ images?: string[] }>(e, "/sdapi/v1/txt2img", {
      body: { prompt: a.prompt, negative_prompt: a.negative || "", width: a.width, height: a.height, steps: e.steps || 20, seed, batch_size: count, n_iter: 1 },
      timeout: 600,
      signal,
    });
    if (!j.images?.length) throw new Error(`${e.name} gave back no pictures.`);
    return j.images.map((b) => fromB64(b));
  }
  // ComfyUI
  let wf: Workflow;
  if (e.workflow?.trim()) wf = fillWorkflow(e.workflow, { prompt: a.prompt, negative: a.negative || "", seed, width: a.width, height: a.height, steps: e.steps || 20, count });
  else {
    let ckpt = e.model || "";
    if (!ckpt) {
      const { checkpoints } = await comfyInfo(e);
      // the first picture checkpoint (a ComfyUI that also makes songs has YuE2 / ACE-Step ones too)
      ckpt = checkpoints.find((c) => !/yue|ace.?step|audio|music|song/i.test(c)) ?? "";
      if (!ckpt) throw new Error("This ComfyUI has no checkpoints in models/checkpoints. Add one, or give it your own workflow.");
    }
    wf = basicWorkflow(ckpt, a, e.steps || 20, seed);
  }
  return runComfy(e, wf, "images", progress, signal);
}

/** Save pictures into the vault's folder for made pictures; returns their vault paths. */
export async function savePictures(pics: Blob[], prompt: string): Promise<string[]> {
  const folder = desk().media.pictureFolder.replace(/^\/+|\/+$/g, "") || "pictures/made";
  const slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").slice(0, 6).join(" ") || "picture";
  const d = new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}.${two(d.getMinutes())}`;
  const out: string[] = [];
  for (const [i, b] of pics.entries()) {
    const ext = /jpeg/.test(b.type) ? "jpg" : /webp/.test(b.type) ? "webp" : "png";
    const p = `${folder}/${stamp} ${slug}${pics.length > 1 ? ` ${i + 1}` : ""}.${ext}`;
    const r = await fetch(`/api/vault/file?path=${encodeURIComponent(p)}`, { method: "PUT", body: b });
    if (!r.ok) throw new Error(`Couldn't save ${p}.`);
    out.push(p);
  }
  return out;
}

// ---------- songs ----------

/** Make one song; returns the audio. */
export async function makeSong(e: SongEngine, a: SongAsk, progress: Progress, signal?: AbortSignal): Promise<{ audio: Blob; ext: string; seed: number }> {
  const seed = a.seed ?? randomSeed();
  const lyrics = a.instrumental || !a.lyrics.trim() ? "[Instrumental]" : a.lyrics;
  const seconds = Math.max(10, Math.min(600, Math.round(a.seconds)));
  if (e.kind === "mlx-serve") {
    // mlx-serve (MLX Core on a Mac): one request, the song comes back as a WAV when it's done
    progress("Making it… (the engine answers when the song is done)");
    const started = Date.now();
    const tick = setInterval(() => progress(`Making it… ${Math.round((Date.now() - started) / 1000)} s`), 1000);
    try {
      const r = await call(e, "/v1/audio/music-generations", {
        body: { ...(e.model ? { model: e.model } : {}), prompt: a.style, lyrics, duration_seconds: seconds, seed, ...(a.title ? { title: a.title } : {}) },
        timeout: 1800,
        signal,
      });
      const type = r.headers.get("content-type") || "";
      if (!r.ok) throw new Error(`${e.name} answered ${r.status}: ${(await r.text()).slice(0, 300)}`);
      if (/json/i.test(type)) {
        // in case a build answers OpenAI-style with base64 or a link instead of the file itself
        const j = (await r.json()) as { data?: { b64_json?: string; url?: string }[]; audio?: string };
        const d = j.data?.[0];
        if (d?.b64_json || j.audio) return { audio: fromB64(d?.b64_json || j.audio!, "audio/wav"), ext: "wav", seed };
        if (d?.url) return { audio: await (await outbound(d.url, {}, e.via ?? desk().net.via)).blob(), ext: "wav", seed };
        throw new Error(`${e.name} answered without a song.`);
      }
      const audio = await r.blob();
      const ext = /mpeg|mp3/i.test(type) ? "mp3" : /flac/i.test(type) ? "flac" : "wav";
      return { audio, ext, seed };
    } finally {
      clearInterval(tick);
    }
  }
  if (e.kind === "acestep") {
    progress("Queued…");
    const made = await json<{ data?: { task_id?: string } }>(e, "/release_task", {
      body: { prompt: a.style, lyrics, audio_duration: seconds, batch_size: 1, audio_format: "mp3", seed, use_random_seed: false, ...(e.model ? { model: e.model } : {}) },
      signal,
    });
    const id = made.data?.task_id;
    if (!id) throw new Error("ACE-Step didn't give a task id.");
    const started = Date.now();
    for (;;) {
      await sleep(2500, signal);
      const q = await json<{ data?: { task_id: string; status: number; result?: string }[] }>(e, "/query_result", { body: { task_id_list: [id] }, signal });
      const t = q.data?.find((x) => x.task_id === id);
      if (t?.status === 2) throw new Error("ACE-Step couldn't make the song.");
      if (t?.status === 1) {
        let files: { file?: string }[] = [];
        try {
          files = JSON.parse(t.result || "[]") as { file?: string }[];
        } catch {
          /* below */
        }
        const file = files.find((f) => f.file)?.file;
        if (!file) throw new Error("ACE-Step finished without a file.");
        progress("Fetching the song…");
        return { audio: await blob(e, file.startsWith("/") ? file : `/${file}`, signal), ext: "mp3", seed };
      }
      progress(`Making it… ${Math.round((Date.now() - started) / 1000)} s`);
    }
  }
  // YuE2 through ComfyUI: the official text-to-music workflow with the song's words, style, length and seed
  const wf = structuredClone(yue2Workflow) as Workflow;
  wf["33:36"].inputs.value = a.style;
  wf["33:37"].inputs.value = lyrics;
  wf["33:34"].inputs.seed = seed;
  wf["33:25"].inputs.max_duration = seconds;
  wf["10"].inputs.filename_prefix = "audio/pandora";
  const [audio] = await runComfy(e, wf, "audio", progress, signal);
  return { audio, ext: "flac", seed };
}

/** Put a made song into the music library and the list of made songs. */
export async function keepSong(a: SongAsk, made: { audio: Blob; ext: string; seed: number }, engine: SongEngine): Promise<MadeSong> {
  const name = `${(a.title || "Untitled").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 80) || "Untitled"}.${made.ext}`;
  const r = await fetch("/api/music/upload", { method: "POST", headers: { "x-filename": encodeURIComponent(name) }, body: made.audio });
  const j = (await r.json().catch(() => ({}))) as { name?: string; error?: string };
  if (!r.ok) throw new Error(j.error || "Couldn't add the song to the music library.");
  await scan();
  const song: MadeSong = { id: crypto.randomUUID(), title: a.title || "Untitled", style: a.style, lyrics: a.instrumental ? "" : a.lyrics, seconds: a.seconds, seed: made.seed, engine: engine.name, file: j.name || name, at: Date.now() };
  const m = desk().media;
  desk().set({ media: { ...m, made: [song, ...m.made].slice(0, 500) } });
  return song;
}

// ---------- words for songs, written by a character ----------

/** A character writes a title, a style and lyrics from a description (Suno's "simple" mode). */
export async function writeSong(charId: string, description: string, instrumental: boolean): Promise<{ title: string; style: string; lyrics: string }> {
  const { chainFor } = await import("./agent.ts");
  const { streamOnce, credential } = await import("./model.ts");
  const { list } = chainFor(charId);
  if (!list.length) throw new Error("No AI connection is available to write the song.");
  const turns = [
    {
      role: "system" as const,
      content:
        "You write songs for a music generator. Answer with exactly three parts and nothing else:\nTITLE: a short title\nSTYLE: one line of comma-separated genre, mood, instruments, tempo and vocal description (under 200 characters)\nLYRICS:\n the lyrics, with section tags on their own lines like [Verse], [Chorus], [Bridge], [Outro]. Two verses, a chorus that repeats, about 16 to 28 lines.",
    },
    { role: "user" as const, content: `${description.trim()}${instrumental ? "\n\n(Instrumental: write LYRICS: [Instrumental])" : ""}` },
  ];
  let last = "";
  for (const { conn, model } of list) {
    try {
      let out = "";
      const r = await streamOnce(conn, model, credential(conn, desk().env), turns, [], 0.9, (p) => (out += p));
      const song = parseSong(r.text || out, instrumental);
      if (song) return song;
      last = "The answer didn't have a style line.";
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`Couldn't write the song. ${last}`.trim());
}

export function newEngineId() {
  return Math.random().toString(36).slice(2, 10);
}
