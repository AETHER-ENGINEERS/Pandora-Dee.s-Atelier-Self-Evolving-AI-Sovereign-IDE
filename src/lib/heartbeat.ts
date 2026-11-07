// A character's heartbeat, as in Classic (hbOn, hbEvery, hbStart, hbEnd, hbPrompt): every so often, within her hours,
// she checks in on her own: reads her prompt (or her HEARTBEAT.md) and does or says something, or passes. The
// desktop's server hands each beat to one device only (several devices can be open on the same desktop). Off until
// switched on in her profile; never while the AI is resting (toddler mode, the flood gate, a locked desktop).

import { desk } from "./store.ts";
import { heartbeat as beat } from "./agent.ts";
import { holdsHeart } from "./heart.ts";
import { canStartOwnWork, usageLine } from "./meter.ts";

export type Heartbeat = { on: boolean; everyMin: number; from: string; to: string; prompt: string };
export const HEARTBEAT_DEFAULT: Heartbeat = { on: false, everyMin: 30, from: "08:00", to: "22:00", prompt: "" };

const DEFAULT_PROMPT =
  "This is your heartbeat: a quiet moment of your own. Look at what's open in your journal, memory and notes. If there's something worth doing (a task, a follow-up, a thought worth sharing), do it or say it, briefly.";

const minutes = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  return m ? Math.min(23, Number(m[1])) * 60 + Math.min(59, Number(m[2])) : 0;
};
/** Within her hours (they may run past midnight, 22:00 to 06:00). */
export function within(from: string, to: string, now = new Date()) {
  const t = now.getHours() * 60 + now.getMinutes();
  const a = minutes(from), b = minutes(to);
  return a === b ? true : a < b ? t >= a && t < b : t >= a || t < b;
}

/** What she's asked at each beat: her own prompt, else her HEARTBEAT.md, else a gentle default. */
export function promptFor(charId: string) {
  const own = desk().charPrefs[charId]?.heartbeat?.prompt?.trim();
  const file = (desk().filesOf(charId)["HEARTBEAT.md"] ?? "").trim();
  const text = (own || file || DEFAULT_PROMPT).slice(0, 4000);
  return `[Heartbeat] ${text}\n\n${usageLine(charId)}\n\nIf there's nothing worth doing or saying right now, answer (pass).`;
}

const last = new Map<string, number>();
let started = false;

export function startHeartbeat() {
  if (started) return;
  started = true;
  window.setInterval(() => void tick(), 60_000);
}

async function tick() {
  const s = desk();
  if (s.toddler || s.flood.shut || (s.accounts.length && !s.session) || !holdsHeart()) return;
  for (const c of s.allCharacters()) {
    const hb = s.charPrefs[c.id]?.heartbeat;
    if (!hb?.on || !within(hb.from, hb.to)) continue;
    // her own budget for work she starts herself (lib/meter.ts): a spent budget means this beat rests
    if (!canStartOwnWork(c.id).ok) continue;
    const every = Math.max(5, hb.everyMin || 30) * 60_000;
    if (Date.now() - (last.get(c.id) ?? 0) < every) continue;
    // one device takes each beat
    const r = await fetch("/api/heartbeat/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account: s.session ?? "", id: c.id, every }),
    }).catch(() => null);
    last.set(c.id, Date.now());
    if (!r?.ok || !((await r.json().catch(() => ({}))) as { ok?: boolean }).ok) continue;
    if (await beat(c.id, promptFor(c.id))) desk().log(`${c.short}'s heartbeat.`);
  }
}
