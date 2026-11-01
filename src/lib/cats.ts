// What the desktop's cats are doing right now, shared by the cats on screen (ui/Cats.tsx) and the characters,
// who hear about them in their prompt.

import type { Cat } from "./store.ts";

export type Pose = "walk" | "sit" | "wash" | "stretch" | "yawn" | "sleep" | "eat";
export type Live = { id: string; name: string; x: number; y: number; tx: number; ty: number; face: 1 | -1; pose: Pose; until: number; t: number; petted: number; pettedAt: number; deferring: boolean; fedAt?: number };

/** A bowl of food put down for the cats: where, and until when there's food in it (it empties once they're eating). */
export type Bowl = { x: number; y: number; at: number; until: number; eating: boolean };
export let bowl: Bowl | null = null;
const bowlListeners = new Set<() => void>();
export const onBowl = (f: () => void) => (bowlListeners.add(f), () => void bowlListeners.delete(f));
/** Put a bowl down (at x, y in SEASIDE's pixels, or near the cats). The cats come over and eat. */
export function feedCats(x?: number, y?: number) {
  const cats = [...live.values()];
  const cx = x ?? (cats.length ? cats.reduce((n, c) => n + c.x, 0) / cats.length : 300);
  const cy = y ?? (cats.length ? Math.max(...cats.map((c) => c.y)) : 400);
  const now = performance.now();
  bowl = { x: cx, y: cy, at: now, until: now + 60_000, eating: false };
  bowlListeners.forEach((f) => f());
}
export function clearBowl() {
  bowl = null;
  bowlListeners.forEach((f) => f());
}

// what each cat is doing right now, for the characters
export const live = new Map<string, Live>();

const DOING: Record<Pose, string> = { walk: "wandering about", sit: "sitting and watching", wash: "washing", stretch: "having a long stretch", yawn: "yawning", sleep: "asleep", eat: "eating from the bowl" };

/** One or two lines for a character's prompt: which cats are around and what they're doing. Empty when there are none. */
export function catsNote(cats: Cat[], on: boolean) {
  if (!on || !cats.length) return "";
  const now = performance.now();
  const parts = cats.map((c, i) => {
    const l = live.get(c.id);
    const what = l ? DOING[l.pose] : "around";
    const pet = l && l.pettedAt && now - l.pettedAt < 120_000 ? ", just petted" : "";
    const fed = l?.fedAt && now - l.fedAt < 20 * 60_000 && l.pose !== "eat" ? ", recently fed" : "";
    return `${c.name}${i === 0 && cats.length > 1 ? " (the senior cat)" : ""} is ${what}${pet}${fed}`;
  });
  return `Cats wander the desktop. ${parts.join("; ")}. You can notice them now and then; they're not people and don't answer.`;
}
