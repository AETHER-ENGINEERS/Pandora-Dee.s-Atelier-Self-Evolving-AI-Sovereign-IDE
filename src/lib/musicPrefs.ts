// The music player's saved settings (kept apart from the player so the store can load them without it).

export type Station = { name: string; url: string; favicon?: string; tags?: string; country?: string; codec?: string; bitrate?: number; homepage?: string };

export type MusicPrefs = {
  folders: string[];
  stations: Station[];
  volume: number;
  shuffle: boolean;
  repeat: "off" | "all" | "one";
  /** Lower the music while a character speaks. */
  duck: boolean;
  /** When a new song starts, the character in focus may say something about it (uses the AI). */
  comment: boolean;
  viz: "off" | "bars" | "scope" | "milkdrop";
  preset: string;
  /** Milkdrop: a new preset every so often. */
  cycle: boolean;
};

export const MUSIC_DEFAULT: MusicPrefs = { folders: [], stations: [], volume: 0.7, shuffle: false, repeat: "all", duck: true, comment: false, viz: "bars", preset: "", cycle: true };
