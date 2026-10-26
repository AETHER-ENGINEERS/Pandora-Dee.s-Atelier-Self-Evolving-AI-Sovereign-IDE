// A character's effective settings: their own choices, falling back to the shared defaults.

import { desk } from "./store.ts";
import type { VoicePrefs } from "./voice.ts";

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

/** Voice settings for a character, and the pitch shift to add on top. */
export function voiceFor(charId: string): { prefs: VoicePrefs; shift: number } {
  const s = desk();
  const own = s.charPrefs[charId]?.voice ?? {};
  const c = s.character(charId);
  const prefs: VoicePrefs = {
    on: s.voice.on && own.on !== false,
    voiceName: own.voiceName || s.voice.voiceName,
    rate: own.rate ?? s.voice.rate,
    pitch: own.pitch ?? s.voice.pitch,
    volume: Math.min(1, s.voice.volume * (own.volume ?? 1)),
    appVolume: s.voice.appVolume,
  };
  // A character's built-in pitch offset applies only when they haven't picked their own pitch.
  return { prefs, shift: own.pitch === undefined ? c?.pitch ?? 0 : 0 };
}
