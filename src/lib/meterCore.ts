// A character's own measurements: what every model call cost her, kept in hourly buckets for 30 days, by kind of
// action and connection, plus the limits providers have hit. Her budget is for the work she starts on her own
// (heartbeats, her own time): she sets it herself, and those check it before they run. Pure, for the logic tests;
// lib/meter.ts keeps it in the store.

export type UsageKind = "reply" | "bridge" | "heartbeat" | "own" | "journal" | "memory" | "storybook" | "game" | "helper";
/** Work she starts on her own, which her budget covers. */
export const SELF_STARTED: UsageKind[] = ["heartbeat", "own"];

export type Usage = { prompt: number; output: number; ms: number; estimated: boolean; limits?: Record<string, string> };
export type Bucket = { calls: number; prompt: number; output: number; ms: number; estimated: number };
export type Ledger = {
  buckets: Record<string, Bucket>;
  limits: { at: number; conn: string; text: string }[];
  /** The latest rate-limit headers each connection sent. */
  headers: Record<string, { at: number; h: Record<string, string> }>;
};
export type Budget = { hourTokens?: number; dayTokens?: number };

export const EMPTY: Ledger = { buckets: {}, limits: [], headers: {} };
const HOUR = 3_600_000;
const KEEP = 30 * 24 * HOUR;

const keyOf = (at: number, kind: UsageKind, conn: string) => `${Math.floor(at / HOUR)}|${kind}|${conn}`;
const parse = (k: string) => {
  const [h, kind, ...conn] = k.split("|");
  return { at: Number(h) * HOUR, kind: kind as UsageKind, conn: conn.join("|") };
};

export function addUsage(l: Ledger, at: number, kind: UsageKind, conn: string, u: Usage): Ledger {
  const buckets: Record<string, Bucket> = {};
  for (const [k, b] of Object.entries(l.buckets)) if (at - parse(k).at < KEEP) buckets[k] = b;
  const k = keyOf(at, kind, conn);
  const b = buckets[k] ?? { calls: 0, prompt: 0, output: 0, ms: 0, estimated: 0 };
  buckets[k] = { calls: b.calls + 1, prompt: b.prompt + u.prompt, output: b.output + u.output, ms: b.ms + u.ms, estimated: b.estimated + (u.estimated ? 1 : 0) };
  const headers = u.limits && Object.keys(u.limits).length ? { ...l.headers, [conn]: { at, h: u.limits } } : l.headers;
  return { ...l, buckets, headers };
}

export function addLimit(l: Ledger, at: number, conn: string, text: string): Ledger {
  return { ...l, limits: [...l.limits.filter((x) => at - x.at < KEEP), { at, conn, text: text.slice(0, 200) }].slice(-20) };
}

/** Tokens spent since a time, for some kinds (all when not given). */
export function spent(l: Ledger, since: number, kinds?: UsageKind[]) {
  let tokens = 0;
  for (const [k, b] of Object.entries(l.buckets)) {
    const p = parse(k);
    if (p.at + HOUR > since && (!kinds || kinds.includes(p.kind))) tokens += b.prompt + b.output;
  }
  return tokens;
}

/** Whether work she starts on her own fits her budget right now. */
export function withinBudget(l: Ledger, b: Budget | undefined, now: number): { ok: boolean; why: string } {
  if (b?.hourTokens && spent(l, now - HOUR + 1, SELF_STARTED) >= b.hourTokens) return { ok: false, why: `her hourly budget (${b.hourTokens} tokens) is spent` };
  if (b?.dayTokens && spent(l, now - 24 * HOUR, SELF_STARTED) >= b.dayTokens) return { ok: false, why: `her 24-hour budget (${b.dayTokens} tokens) is spent` };
  return { ok: true, why: "" };
}

const fmt = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(0)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));

/** One line for a heartbeat prompt: where she stands. */
export function standing(l: Ledger, b: Budget | undefined, now: number) {
  const own = spent(l, now - 24 * HOUR, SELF_STARTED);
  const all = spent(l, now - 24 * HOUR);
  const left = b?.dayTokens ? ` (${fmt(Math.max(0, b.dayTokens - own))} left of your ${fmt(b.dayTokens)} daily budget)` : "";
  return `Your last 24 hours: ${fmt(all)} tokens in all, ${fmt(own)} on work you started yourself${left}. The usage tool has the details.`;
}

/** What she reads with the usage tool. */
export function summary(l: Ledger, b: Budget | undefined, now: number) {
  const rows = Object.entries(l.buckets).map(([k, v]) => ({ ...parse(k), ...v }));
  const since = (ms: number) => rows.filter((r) => r.at + HOUR > now - ms);
  const total = (rs: typeof rows) => rs.reduce((n, r) => n + r.prompt + r.output, 0);
  const lines = [
    `This hour: ${fmt(total(rows.filter((r) => r.at + HOUR > now - HOUR + 1)))} tokens. Last 24 hours: ${fmt(total(since(24 * HOUR)))}. Last 7 days: ${fmt(total(since(7 * 24 * HOUR)))}.`,
    `Your budget for work you start yourself: ${b?.hourTokens ? `${fmt(b.hourTokens)} an hour` : "no hourly limit"}, ${b?.dayTokens ? `${fmt(b.dayTokens)} a day` : "no daily limit"}. ${withinBudget(l, b, now).ok ? "Within it." : `Over: ${withinBudget(l, b, now).why}.`}`,
    "",
    "What each kind of action costs you (last 7 days, average per model call; one turn can take several calls when tools are used):",
  ];
  const byKind = new Map<string, { calls: number; tokens: number; ms: number; est: number }>();
  for (const r of since(7 * 24 * HOUR)) {
    const x = byKind.get(r.kind) ?? { calls: 0, tokens: 0, ms: 0, est: 0 };
    byKind.set(r.kind, { calls: x.calls + r.calls, tokens: x.tokens + r.prompt + r.output, ms: x.ms + r.ms, est: x.est + r.estimated });
  }
  for (const [kind, x] of [...byKind].sort((a, b) => b[1].tokens - a[1].tokens))
    lines.push(`- ${kind}: ${x.calls} calls, about ${fmt(x.tokens / x.calls)} tokens and ${(x.ms / x.calls / 1000).toFixed(1)} s each${x.est ? ` (${x.est} estimated: that server didn't report)` : ""}`);
  if (!byKind.size) lines.push("- nothing yet");
  const byConn = new Map<string, number>();
  for (const r of since(24 * HOUR)) byConn.set(r.conn, (byConn.get(r.conn) ?? 0) + r.prompt + r.output);
  if (byConn.size) lines.push("", `By connection, last 24 hours: ${[...byConn].map(([c, n]) => `${c} ${fmt(n)}`).join(", ")}.`);
  for (const [conn, { at, h }] of Object.entries(l.headers)) lines.push(`${conn} said at ${new Date(at).toISOString().slice(11, 16)} UTC: ${Object.entries(h).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  const hits = l.limits.filter((x) => now - x.at < 7 * 24 * HOUR);
  if (hits.length) lines.push("", "Limits you hit (last 7 days):", ...hits.slice(-5).map((x) => `- ${new Date(x.at).toISOString().slice(0, 16).replace("T", " ")} UTC, ${x.conn}: ${x.text}`));
  return lines.join("\n");
}
