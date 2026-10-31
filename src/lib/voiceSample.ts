// Voice samples: a short recording of how a character should sound, kept in the vault, for voice engines that clone
// a voice from a sample (sent with each line as ref_audio, with what's said in it as ref_text). Any audio the
// browser can play goes in; it's kept as a 24 kHz mono WAV of up to 20 seconds, which is what cloning models want.

const RATE = 24_000;
export const MAX_SECONDS = 20;

/** Any audio file → a 24 kHz mono 16-bit WAV, cut to MAX_SECONDS. */
export async function toSampleWav(file: Blob): Promise<{ wav: Blob; seconds: number }> {
  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error("That file isn't audio this browser can read. Try a WAV, MP3, M4A or OGG.");
  } finally {
    void ctx.close();
  }
  const seconds = Math.min(MAX_SECONDS, decoded.duration);
  const off = new OfflineAudioContext(1, Math.ceil(seconds * RATE), RATE);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const mono = (await off.startRendering()).getChannelData(0);
  const out = new DataView(new ArrayBuffer(44 + mono.length * 2));
  const text = (at: number, s: string) => [...s].forEach((ch, i) => out.setUint8(at + i, ch.charCodeAt(0)));
  text(0, "RIFF");
  out.setUint32(4, 36 + mono.length * 2, true);
  text(8, "WAVEfmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, 1, true);
  out.setUint32(24, RATE, true);
  out.setUint32(28, RATE * 2, true);
  out.setUint16(32, 2, true);
  out.setUint16(34, 16, true);
  text(36, "data");
  out.setUint32(40, mono.length * 2, true);
  for (let i = 0; i < mono.length; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, mono[i])) * 0x7fff, true);
  return { wav: new Blob([out.buffer], { type: "audio/wav" }), seconds: Math.round(seconds * 10) / 10 };
}

export const sampleUrl = (entry: string) => `/api/vault/raw/${entry.split("/").map(encodeURIComponent).join("/")}`;

export async function uploadSample(charId: string, wav: Blob): Promise<string> {
  const r = await fetch(`/api/voice-sample?char=${encodeURIComponent(charId)}`, { method: "POST", body: wav });
  const j = (await r.json().catch(() => ({}))) as { entry?: string; error?: string };
  if (!r.ok || !j.entry) throw new Error(j.error || `The desktop answered ${r.status}.`);
  return j.entry;
}

export async function removeSample(charId: string, entry: string) {
  await fetch(`/api/voice-sample?char=${encodeURIComponent(charId)}&entry=${encodeURIComponent(entry)}`, { method: "DELETE" });
}

// the sample as a data: address, made once per sample (engines get it with every line)
const inline = new Map<string, Promise<string>>();
export function sampleData(entry: string): Promise<string> {
  let p = inline.get(entry);
  if (!p) {
    p = fetch(sampleUrl(entry))
      .then((r) => {
        if (!r.ok) throw new Error(`The voice sample is missing (${r.status}).`);
        return r.blob();
      })
      .then(
        (b) =>
          new Promise<string>((ok, no) => {
            const fr = new FileReader();
            fr.onload = () => ok(String(fr.result));
            fr.onerror = () => no(fr.error);
            fr.readAsDataURL(b);
          }),
      );
    p.catch(() => inline.delete(entry));
    inline.set(entry, p);
  }
  return p;
}
