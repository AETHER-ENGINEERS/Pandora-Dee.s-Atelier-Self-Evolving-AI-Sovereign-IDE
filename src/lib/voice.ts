// Speech through the computer's own voices, with a mouth value for lip-sync.
// Nothing is downloaded and nothing is sent anywhere to be spoken.

/** volume is 0..1 for the voices; appVolume is 0..1 for sound from games and apps. */
export type VoicePrefs = { on: boolean; voiceName: string; rate: number; pitch: number; volume: number; appVolume: number };

export const VOICE_DEFAULT: VoicePrefs = { on: true, voiceName: "", rate: 1.03, pitch: 1.1, volume: 0.8, appVolume: 0.8 };

export type Speech = { who: string; mouth: number; text: string };

const IDLE: Speech = { who: "", mouth: 0, text: "" };
let snap: Speech = IDLE;
const listeners = new Set<() => void>();

export const speech = {
  get: () => snap,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

function publish(next: Speech, force = false) {
  if (!force && next.who === snap.who && Math.abs(next.mouth - snap.mouth) < 0.03 && next.text === snap.text) return;
  snap = next;
  for (const fn of listeners) fn();
}

export function mouthFor(ch: string) {
  const c = ch.toLowerCase();
  if (c === "a" || c === "o") return 0.95;
  if (c === "e") return 0.62;
  if (c === "i" || c === "y") return 0.38;
  if (c === "u") return 0.72;
  if ("mbp".includes(c)) return 0.04;
  if ("fv".includes(c)) return 0.16;
  if ("szxjtnd".includes(c)) return 0.22;
  if (".,!?;:".includes(c)) return 0;
  if (c === " ") return 0.06;
  return 0.3;
}

export function mouthAt(text: string, progress: number) {
  if (!text) return 0;
  const p = Math.min(0.999, Math.max(0, progress));
  const i = Math.floor(p * text.length);
  const mix = p * text.length - i;
  return mouthFor(text[i] ?? " ") * (1 - mix) + mouthFor(text[Math.min(text.length - 1, i + 1)] ?? " ") * mix;
}

/** Split long text at sentence edges so the browser's speech engine doesn't cut off. */
export function chunks(text: string, size = 180) {
  const clean = text
    .replace(/```[\s\S]*?```/g, " (code) ")
    .replace(/[*_`#>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  const out: string[] = [];
  let rest = clean;
  while (rest.length > size) {
    const slice = rest.slice(0, size);
    const cut = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("? "), slice.lastIndexOf("! "), slice.lastIndexOf(", "), slice.lastIndexOf(" "));
    const at = cut > 40 ? cut + 1 : size;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

function pickVoice(prefer: string): SpeechSynthesisVoice | null {
  let voices: SpeechSynthesisVoice[] = [];
  try {
    voices = speechSynthesis.getVoices();
  } catch {
    return null;
  }
  let best: SpeechSynthesisVoice | null = null;
  let score = -1;
  for (const v of voices) {
    let s = 0;
    if (prefer && v.name === prefer) s = 1000;
    if (/en[-_]GB|british/i.test(`${v.name} ${v.lang}`)) s += 40;
    if (/female|woman|fiona|kate|serena|susan|moira|samantha|victoria|karen|tessa|libby|sonia|hazel|zira|aria|jenny/i.test(v.name)) s += 30;
    if (/^en/i.test(v.lang)) s += 10;
    if (s > score) {
      score = s;
      best = v;
    }
  }
  return best;
}

export function voiceList(): { name: string; lang: string }[] {
  try {
    return speechSynthesis.getVoices().map((v) => ({ name: v.name, lang: v.lang }));
  } catch {
    return [];
  }
}

type Job = { who: string; text: string; pitchShift: number };
let queue: Job[] = [];
let running = false;
let token = 0;

export function stopSpeaking() {
  token++;
  queue = [];
  running = false;
  try {
    speechSynthesis.cancel();
  } catch {
    /* no speech engine */
  }
  publish(IDLE, true);
}

/** Queue a line. Lines from different characters play one after another. */
export function speak(who: string, text: string, prefs: VoicePrefs, pitchShift = 0) {
  if (!prefs.on || !text.trim()) return;
  for (const part of chunks(text)) queue.push({ who, text: part, pitchShift });
  if (!running) run(prefs, token);
}

function run(prefs: VoicePrefs, mine: number) {
  const job = queue.shift();
  if (!job || mine !== token) {
    running = false;
    publish(IDLE, true);
    return;
  }
  running = true;
  const rate = Math.min(1.6, Math.max(0.6, prefs.rate));
  const pitch = Math.min(2, Math.max(0.3, prefs.pitch + job.pitchShift));
  const estimate = Math.min(14_000, Math.max(800, (job.text.length / (14 * rate)) * 1000));
  const started = performance.now();
  let settled = false;
  let raf = 0;
  let boundaryAt = -1;
  const finish = () => {
    if (settled) return;
    settled = true;
    cancelAnimationFrame(raf);
    clearTimeout(safety);
    publish({ who: job.who, mouth: 0, text: "" }, true);
    setTimeout(() => run(prefs, mine), 120);
  };
  const tick = () => {
    if (settled || mine !== token) return;
    const progress = boundaryAt >= 0 ? boundaryAt / job.text.length + (performance.now() - started) / estimate / 8 : (performance.now() - started) / estimate;
    publish({ who: job.who, mouth: mouthAt(job.text, progress % 1), text: job.text });
    raf = requestAnimationFrame(tick);
  };
  const safety = window.setTimeout(finish, estimate * 2 + 1500);
  raf = requestAnimationFrame(tick);
  try {
    if (typeof speechSynthesis === "undefined") {
      window.setTimeout(finish, estimate);
      return;
    }
    const u = new SpeechSynthesisUtterance(job.text);
    const v = pickVoice(prefs.voiceName);
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    }
    u.rate = rate;
    u.pitch = pitch;
    u.volume = Math.min(1, Math.max(0, prefs.volume ?? 1));
    u.onboundary = (e) => {
      boundaryAt = e.charIndex;
    };
    u.onend = finish;
    u.onerror = finish;
    speechSynthesis.speak(u);
  } catch {
    window.setTimeout(finish, estimate);
  }
}
