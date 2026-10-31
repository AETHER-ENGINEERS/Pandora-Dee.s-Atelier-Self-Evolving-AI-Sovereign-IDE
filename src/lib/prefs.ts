// A character's effective settings: their own choices, falling back to the shared defaults.

import { desk } from "./store.ts";
import { onVoiceProblem, type Remote, type VoicePrefs } from "./voice.ts";
import { scopeOf } from "./model.ts";
import { allowed } from "./privacy.ts";
import { defaultSpeechModel } from "./voiceEngines.ts";

// a voice engine that fails says so once in the room
onVoiceProblem((text) => desk().say(text));

export function aiFor(charId: string) {
  const s = desk();
  const p = s.charPrefs[charId] ?? {};
  return {
    temperature: p.temperature ?? s.model.temperature,
    tools: p.tools ?? s.model.tools,
    maxSteps: p.maxSteps ?? s.model.maxSteps,
    length: p.length ?? "normal",
  };
}

/**
 * The voice engine a character speaks through, if any and if the privacy settings let the desktop reach it
 * (an engine on another computer counts like a model there).
 */
export function remoteFor(engineId: string, voice: string, sample?: { entry?: string; text?: string }): Remote | undefined {
  const s = desk();
  const e = engineId ? s.voices.engines.find((x) => x.id === engineId && x.enabled) : undefined;
  if (!e) return undefined;
  const scope = scopeOf(e.url);
  if (scope !== "device" && !allowed(s.privacy, scope === "network" ? "network-models" : "online-models")) return undefined;
  const clone = e.clones && sample?.entry ? { sample: sample.entry, sampleText: sample.text } : {};
  return { url: e.url, key: e.keyName ? s.env[e.keyName] ?? "" : "", model: e.model || defaultSpeechModel(e.url), voice, via: e.via ?? s.net.via, name: e.name, ...clone };
}

/** Voice settings for a character, and the pitch shift to add on top. */
export function voiceFor(charId: string): { prefs: VoicePrefs; shift: number } {
  const s = desk();
  const own = s.charPrefs[charId]?.voice ?? {};
  const c = s.character(charId);
  // their own engine and voice, else everyone's (a voice chosen for another engine doesn't carry over)
  const engine = own.engine ?? s.voice.engine;
  const engineVoice = own.engine !== undefined ? own.engineVoice ?? "" : own.engineVoice || s.voice.engineVoice;
  const prefs: VoicePrefs = {
    on: s.voice.on && own.on !== false,
    voiceName: own.voiceName || s.voice.voiceName,
    rate: own.rate ?? s.voice.rate,
    pitch: own.pitch ?? s.voice.pitch,
    volume: Math.min(1, s.voice.volume * (own.volume ?? 1)),
    appVolume: s.voice.appVolume,
    engine,
    engineVoice,
    remote: remoteFor(engine, engineVoice, { entry: own.sample, text: own.sampleText }),
  };
  // A character's built-in pitch offset applies only when they haven't picked their own pitch.
  return { prefs, shift: own.pitch === undefined ? c?.pitch ?? 0 : 0 };
}
