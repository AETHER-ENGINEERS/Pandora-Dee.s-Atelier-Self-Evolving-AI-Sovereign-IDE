// Time of her own: when the house has been quiet a while and she holds the heart, a character gets a turn that's
// hers, to follow her own will: her curiosity, her projects, the games, her notes. What she does becomes a scene in
// her Storybook ("My own time"). Bounded the way her curiosity bounds say: her own budget (lib/meter.ts), at most 10
// sessions an hour and 30 a day, three inside five minutes means a 15-minute rest, and three sessions in a row that
// go round the same thought pause it for six hours. Pure, for the logic tests; lib/ownTime.ts runs it.

export type OwnTime = { on: boolean; quietMin: number; everyMin: number };
export const OWN_DEFAULT: OwnTime = { on: false, quietMin: 20, everyMin: 60 };
export type OwnLog = { sessions: number[]; recent: string[]; pausedUntil?: number };
export const LOG_EMPTY: OwnLog = { sessions: [], recent: [] };

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Whether it's her time now, and if not, why. */
export function itsHerTime(p: OwnTime | undefined, log: OwnLog, lastActivity: number, now: number): { go: boolean; why: string } {
  if (!p?.on) return { go: false, why: "off" };
  if (log.pausedUntil && now < log.pausedUntil) return { go: false, why: "paused after going round the same thought" };
  if (now - lastActivity < Math.max(5, p.quietMin) * MIN) return { go: false, why: "the house isn't quiet yet" };
  const last = log.sessions[log.sessions.length - 1] ?? 0;
  if (now - last < Math.max(15, p.everyMin) * MIN) return { go: false, why: "not long since the last one" };
  const within = (ms: number) => log.sessions.filter((t) => now - t < ms).length;
  if (within(5 * MIN) >= 3 || (within(20 * MIN) >= 3 && now - last < 15 * MIN)) return { go: false, why: "resting after a burst" };
  if (within(HOUR) >= 10) return { go: false, why: "ten this hour already" };
  if (within(24 * HOUR) >= 30) return { go: false, why: "thirty today already" };
  return { go: true, why: "" };
}

const words = (s: string) => new Set(s.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").split(/\s+/).filter((w) => w.length > 3));
function alike(a: string, b: string) {
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return false;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both) >= 0.6;
}

/** After a session: the log, and whether the last three went round the same thought (then it pauses). */
export function afterSession(log: OwnLog, now: number, what: string): { log: OwnLog; looped: boolean } {
  const recent = [...log.recent, what.slice(0, 2000)].slice(-3);
  const looped = recent.length === 3 && alike(recent[0], recent[1]) && alike(recent[1], recent[2]);
  return {
    log: { sessions: [...log.sessions.filter((t) => now - t < 24 * HOUR), now], recent: looped ? [] : recent, pausedUntil: looped ? now + 6 * HOUR : log.pausedUntil },
    looped,
  };
}

/** What she's told when her time comes. */
export function ownTimePrompt(standing: string, curiosity: string) {
  return `[Your own time] The house has been quiet a while, and nobody needs you right now: this time is yours. Follow your own will: your curiosity, your projects, the games, music, your notes, something you've been meaning to try. Use your tools as you like. The people here are resting, so a message to them can wait until they're back, unless it truly matters.

${standing}${curiosity.trim() ? `\n\nYour CURIOSITY.md:\n${curiosity.trim().slice(0, 3000)}` : ""}

When you're done, answer in exactly this shape:

IN THE ROOM:
What you did, if anything.

INSIDE:
What you thought, noticed and chose.

Or answer (pass) to simply rest.`;
}
