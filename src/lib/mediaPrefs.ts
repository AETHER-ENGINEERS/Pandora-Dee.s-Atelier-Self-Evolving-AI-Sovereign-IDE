// Settings for making pictures and songs: the engines (servers that do the work, usually on another computer on
// your network) and where the results go. Kept apart from media.ts so the store can import it without a cycle.

import type { Via } from "./outbound.ts";

export type ImageKind = "comfyui" | "a1111" | "openai";
export type SongKind = "acestep" | "yue2-comfyui";

export type ImageEngine = {
  id: string;
  name: string;
  kind: ImageKind;
  /** Where it answers: http://macbook.local:8188 (ComfyUI), :7860 (Draw Things / Automatic1111), https://api.openai.com/v1 */
  url: string;
  /** Name of the key in Keys, if it needs one. */
  keyName?: string;
  /** OpenAI-style: the model; ComfyUI: the checkpoint (blank: the first it has). */
  model?: string;
  /** ComfyUI: your own workflow in API format, with {{prompt}} {{negative}} {{seed}} {{width}} {{height}} {{steps}} where they go. */
  workflow?: string;
  steps?: number;
  via?: Via;
  enabled: boolean;
};

export type SongEngine = {
  id: string;
  name: string;
  kind: SongKind;
  /** ACE-Step's API (http://macbook.local:8001) or ComfyUI (http://pc.local:8188) for YuE2. */
  url: string;
  keyName?: string;
  /** ACE-Step: which model (blank: its default). */
  model?: string;
  via?: Via;
  enabled: boolean;
};

export type MadeSong = {
  id: string;
  title: string;
  style: string;
  lyrics: string;
  seconds: number;
  seed: number;
  engine: string;
  /** Its file in the music library (as named there). */
  file: string;
  at: number;
};

export type MediaPrefs = {
  images: ImageEngine[];
  songs: SongEngine[];
  /** Vault folder for pictures that are made. */
  pictureFolder: string;
  /** Songs made here, newest first (the audio itself is in the music library). */
  made: MadeSong[];
  /** Characters may make pictures and songs with a tool (off until switched on). */
  characterTools: boolean;
};

export const MEDIA_DEFAULT: MediaPrefs = { images: [], songs: [], pictureFolder: "pictures/made", made: [], characterTools: false };
