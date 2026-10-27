// Turning your speech into text with a voice engine (MLX Audio on a Mac, or another server with OpenAI's
// transcription API). The recording becomes a small 16 kHz mono WAV, which every such server reads.

import { desk } from "./store.ts";
import { outbound } from "./outbound.ts";
import { engineUrl } from "./voiceEngines.ts";
import { scopeOf } from "./model.ts";
import { allowed, blockedBecause } from "./privacy.ts";

export type Recording = { stop: () => Promise<Blob>; cancel: () => void; level: () => number };

/** Why listening can't start here, or "" when it can. */
export function cantListen(): string {
  const s = desk();
  const e = s.voices.engines.find((x) => x.id === s.voices.listen.engine && x.enabled);
  if (!e) return "Choose an engine for listening in Settings → Voice first.";
  if (!window.isSecureContext) return "Browsers only allow the microphone on https pages (or on this computer itself). Open the desktop through its https address (tailscale serve) to talk to it from here.";
  if (!navigator.mediaDevices?.getUserMedia) return "This browser can't record.";
  const scope = scopeOf(e.url);
  if (scope !== "device") {
    const f = scope === "network" ? "network-models" : "online-models";
    if (!allowed(s.privacy, f)) return blockedBecause(s.privacy, f);
  }
  return "";
}

/** Start recording from the microphone. */
export async function record(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
  const rec = new MediaRecorder(stream);
  const parts: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
  // a level meter, so you can see it hears you
  const ac = new AudioContext();
  const an = ac.createAnalyser();
  an.fftSize = 512;
  ac.createMediaStreamSource(stream).connect(an);
  const buf = new Float32Array(an.fftSize);
  const end = () => {
    stream.getTracks().forEach((t) => t.stop());
    void ac.close();
  };
  rec.start(250);
  return {
    level: () => {
      an.getFloatTimeDomainData(buf);
      let s = 0;
      for (const v of buf) s += v * v;
      return Math.min(1, Math.sqrt(s / buf.length) * 6);
    },
    cancel: () => {
      rec.onstop = null;
      if (rec.state !== "inactive") rec.stop();
      end();
    },
    stop: () =>
      new Promise((ok) => {
        rec.onstop = () => {
          end();
          ok(new Blob(parts, { type: rec.mimeType || "audio/webm" }));
        };
        rec.stop();
      }),
  };
}

/** Any recording the browser can play, as 16 kHz mono 16-bit WAV. */
export async function toWav16k(blob: Blob): Promise<Uint8Array> {
  const ac = new AudioContext();
  const decoded = await ac.decodeAudioData(await blob.arrayBuffer());
  void ac.close();
  const rate = 16000;
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const pcm = (await off.startRendering()).getChannelData(0);
  const out = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  out.setUint32(4, 36 + pcm.length * 2, true);
  str(8, "WAVEfmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, 1, true);
  out.setUint32(24, rate, true);
  out.setUint32(28, rate * 2, true);
  out.setUint16(32, 2, true);
  out.setUint16(34, 16, true);
  str(36, "data");
  out.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
  return new Uint8Array(out.buffer);
}

/** Send a recording to the listening engine; returns what was said. */
export async function transcribe(blob: Blob): Promise<string> {
  const s = desk();
  const e = s.voices.engines.find((x) => x.id === s.voices.listen.engine && x.enabled);
  if (!e) throw new Error("No listening engine is chosen (Settings → Voice).");
  const wav = await toWav16k(blob);
  // multipart/form-data by hand, so it can go through the desktop's relay
  const boundary = `pdd${Math.random().toString(36).slice(2)}`;
  const enc = new TextEncoder();
  const field = (name: string, value: string) => enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
  const fields = [field("model", s.voices.listen.model || "mlx-community/whisper-large-v3-turbo"), field("response_format", "json")];
  if (s.voices.listen.language) fields.push(field("language", s.voices.listen.language));
  const head = enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="speech.wav"\r\nContent-Type: audio/wav\r\n\r\n`);
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);
  const parts = [...fields, head, wav, tail];
  const body = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) body.set(p, (at += p.length) - p.length);
  const key = e.keyName ? s.env[e.keyName] ?? "" : "";
  const r = await outbound(engineUrl(e.url, "transcriptions"), { method: "POST", headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, ...(key ? { Authorization: `Bearer ${key}` } : {}) }, body, timeout: 180 }, e.via ?? s.net.via);
  const text = await r.text();
  if (!r.ok) throw new Error(`${e.name} answered ${r.status}: ${text.replace(/\s+/g, " ").slice(0, 200)}`);
  try {
    const j = JSON.parse(text) as { text?: string };
    if (typeof j.text === "string") return j.text.trim();
  } catch {
    /* plain text, or lines of JSON */
  }
  // ndjson (MLX Audio's native form): the text pieces of each line
  const lines = text.split("\n").map((l) => {
    try {
      return (JSON.parse(l) as { text?: string }).text ?? "";
    } catch {
      return l;
    }
  });
  return lines.join(" ").replace(/\s+/g, " ").trim();
}
