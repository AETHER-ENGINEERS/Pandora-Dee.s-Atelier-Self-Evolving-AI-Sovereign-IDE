// Each character's measurements, kept in the store (lib/meterCore.ts has the arithmetic): recorded after every model
// call, read by the usage tool and her heartbeat, and checked before work she starts on her own.

import { desk } from "./store.ts";
import { addLimit, addUsage, EMPTY, standing, summary, withinBudget, type Budget, type Usage, type UsageKind } from "./meterCore.ts";

const ledgerOf = (id: string) => desk().meter?.[id] ?? EMPTY;

export function recordUsage(charId: string, kind: UsageKind, conn: string, u: Usage | undefined) {
  if (!u) return;
  const s = desk();
  s.set({ meter: { ...s.meter, [charId]: addUsage(ledgerOf(charId), Date.now(), kind, conn, u) } });
}

/** A provider said no: a usage limit, rate limit or no credits. */
export function recordLimit(charId: string, conn: string, text: string) {
  const s = desk();
  s.set({ meter: { ...s.meter, [charId]: addLimit(ledgerOf(charId), Date.now(), conn, text) } });
}
export const isLimitError = (msg: string) => /\b(429|402)\b|rate.?limit|usage limit|quota|too many requests|no credits|weekly limit|hourly limit|session limit/i.test(msg);

export const budgetOf = (id: string): Budget | undefined => desk().charPrefs[id]?.budget;
export const setBudget = (id: string, b: Budget) => desk().setCharPrefs(id, { budget: b });
/** Whether work she starts on her own (a heartbeat, her own time) fits her budget now. */
export const canStartOwnWork = (id: string) => withinBudget(ledgerOf(id), budgetOf(id), Date.now());
export const usageLine = (id: string) => standing(ledgerOf(id), budgetOf(id), Date.now());
export const usageSummary = (id: string) => summary(ledgerOf(id), budgetOf(id), Date.now());
