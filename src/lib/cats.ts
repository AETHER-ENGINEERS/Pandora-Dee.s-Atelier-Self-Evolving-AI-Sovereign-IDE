// What the desktop's cats are doing right now, shared by the cats on screen (ui/Cats.tsx) and the characters,
// who hear about them in their prompt.

import type { Cat } from "./store.ts";

export type Pose = "walk" | "sit" | "wash" | "stretch" | "yawn" | "sleep";
export type Live = { id: string; name: string; x: number; y: number; tx: number; ty: number; face: 1 | -1; pose: Pose; until: number; t: number; petted: number; pettedAt: number; deferring: boolean };

// what each cat is doing right now, for the characters
export const live = new Map<string, Live>();

const DOING: Record<Pose, string> = { walk: "wandering about", sit: "sitting and watching", wash: "washing", stretch: "having a long stretch", yawn: "yawning", sleep: "asleep" };

/** One or two lines for a character's prompt: which cats are around and what they're doing. Empty when there are none. */
export function catsNote(cats: Cat[], on: boolean) {
  if (!on || !cats.length) return "";
  const now = performance.now();
  const parts = cats.map((c, i) => {
    const l = live.get(c.id);
    const what = l ? DOING[l.pose] : "around";
    const pet = l && l.pettedAt && now - l.pettedAt < 120_000 ? ", just petted" : "";
    return `${c.name}${i === 0 && cats.length > 1 ? " (the senior cat)" : ""} is ${what}${pet}`;
  });
  return `Cats wander the desktop. ${parts.join("; ")}. You can notice them now and then; they're not people and don't answer.`;
}
