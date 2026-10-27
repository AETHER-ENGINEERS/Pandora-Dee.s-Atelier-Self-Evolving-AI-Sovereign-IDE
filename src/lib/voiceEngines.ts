// Voice engines: servers that speak for the characters and listen to you (OpenAI's speech API shape, which MLX
// Audio, Kokoro-FastAPI, Speaches, LocalAI and OpenAI itself all answer). Kept apart so the store can import it
// without a cycle.

import type { Via } from "./outbound.ts";

export type VoiceEngine = {
  id: string;
  name: string;
  /** The server: http://mac:15666 (MLX Audio), https://api.openai.com/v1, … */
  url: string;
  keyName?: string;
  /** The speaking model (blank: Kokoro on MLX Audio, tts-1 elsewhere). */
  model?: string;
  via?: Via;
  enabled: boolean;
};

export type VoiceEnginePrefs = {
  engines: VoiceEngine[];
  /** Turning your speech into text: which engine ("" = off) and model. */
  listen: { engine: string; model: string; language: string };
};

export const VOICE_ENGINES_DEFAULT: VoiceEnginePrefs = {
  engines: [],
  listen: { engine: "", model: "mlx-community/whisper-large-v3-turbo", language: "" },
};

/** Where a voice engine's speech and transcription endpoints are (it may be given with or without /v1). */
export function engineUrl(base: string, path: "speech" | "transcriptions" | "voices" | "models") {
  const b = base.trim().replace(/\/+$/, "");
  const root = /\/v1$/.test(b) ? b : `${b}/v1`;
  return path === "models" ? `${root}/models` : `${root}/audio/${path}`;
}

export const isOpenAI = (url: string) => /api\.openai\.com/i.test(url);

/** The speaking model to ask for when none is set. */
export const defaultSpeechModel = (url: string) => (isOpenAI(url) ? "gpt-4o-mini-tts" : "mlx-community/Kokoro-82M-bf16");

/** OpenAI's built-in voices (its API has no list). */
export const OPENAI_VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse"];
