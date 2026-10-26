// Flood gate: a burst of incoming text shuts general access and stops the characters
// from acting until the keyholder reopens it. Pure functions so they can be tested.

export const WINDOW_MS = 20_000;
export const BURST = 6;
export const REPEAT = 3;
export const LARGE = 1800;
export const HEAVY = 700;
export const HEAVY_COUNT = 3;

export type Role = "keyholder" | "resident" | "general";
export type Stamp = { key: string; chars: number; at: number };

export type FloodState = {
  armed: boolean;
  shut: boolean;
  reason: string;
  at: number;
  recent: Stamp[];
};

export const FLOOD_DEFAULT: FloodState = { armed: true, shut: false, reason: "", at: 0, recent: [] };

export const FLOOD_RULES = [
  `${BURST} messages within ${WINDOW_MS / 1000} seconds`,
  `the same message ${REPEAT} times`,
  `one message of ${LARGE.toLocaleString()} characters or more`,
  `${HEAVY_COUNT} messages of ${HEAVY} characters or more`,
];

export function fingerprint(text: string) {
  return text.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 180);
}

/** Weigh one incoming message. Returns a reason when the gate should shut. */
export function judge(recent: Stamp[], text: string, now: number): { trip: string; recent: Stamp[] } {
  const next = [...recent.filter((s) => now - s.at < WINDOW_MS), { key: fingerprint(text), chars: text.length, at: now }].slice(-12);
  if (text.length >= LARGE) return { trip: "One very large message arrived at once.", recent: [] };
  if (next.length >= BURST) return { trip: "Too many messages arrived in a short time.", recent: [] };
  const last = next[next.length - 1];
  const same = next.filter((s) => s.key === last.key).length;
  if (last.key.length >= 12 && same >= REPEAT) return { trip: "The same message arrived again and again.", recent: [] };
  if (next.filter((s) => s.chars >= HEAVY).length >= HEAVY_COUNT) return { trip: "Several large messages arrived together.", recent: [] };
  return { trip: "", recent: next };
}

/** May someone with this role wake the characters right now? */
export function mayWake(role: Role, shut: boolean, allowed: Role[]) {
  if (role === "keyholder") return true;
  if (shut && role === "general") return false;
  return allowed.includes(role);
}
