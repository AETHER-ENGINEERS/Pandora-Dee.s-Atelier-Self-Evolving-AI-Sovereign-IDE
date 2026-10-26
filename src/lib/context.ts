// The context guard: how much of the model's window a conversation is using,
// and compacting the earlier part into a summary when it grows too long.

import { desk } from "./store.ts";
import { streamOnce, type Turn } from "./model.ts";
import { currentChat, setSummary } from "./chats.ts";
import type { Message } from "./room.ts";

/** Rough token count: about four characters a token. */
export const tokens = (text: string) => Math.ceil(text.length / 4);

/** The window to measure against: the chosen num_ctx, or a common default. */
export const windowSize = () => desk().chat.numCtx || 8192;

/** Messages not yet covered by the summary. */
export function liveMessages(messages = desk().messages): Message[] {
  const upTo = currentChat().summaryUpTo ?? 0;
  return messages.filter((m) => m.at > upTo && !m.pass && !m.quiet);
}

export function usage(systemText = "") {
  const live = liveMessages().slice(-desk().chat.historyLimit);
  const used = tokens(systemText) + tokens(currentChat().summary ?? "") + live.reduce((n, m) => n + tokens(m.text) + 6, 0);
  return { used, window: windowSize(), messages: live.length, summary: Boolean(currentChat().summary) };
}

/** True when the settings say it's time to compact. */
export function shouldCompact(systemText = "") {
  const c = desk().chat;
  const live = liveMessages();
  if (live.length <= c.keepRecent + 2) return false;
  if (c.compactAfter > 0 && live.length >= c.compactAfter) return true;
  if (c.compactAtPct > 0) {
    const u = usage(systemText);
    return (u.used / u.window) * 100 >= c.compactAtPct;
  }
  return false;
}

function asText(m: Message) {
  return `${m.kind === "notice" ? "[Note]" : m.name}: ${m.text}`;
}

/**
 * Summarise everything but the most recent messages. Uses the compaction connection when one is set,
 * otherwise the first connection that the given character would use.
 */
export async function compact(chain: { conn: import("./model.ts").Connection; model: string }[], keyOf: (c: import("./model.ts").Connection) => string): Promise<string> {
  const s = desk();
  const keep = Math.max(2, s.chat.keepRecent);
  const live = liveMessages();
  if (live.length <= keep) return "There isn't enough yet to compact.";
  const older = live.slice(0, -keep);
  const prior = currentChat().summary ?? "";
  const picked = s.chat.compactConn ? s.model.connections.find((c) => c.id === s.chat.compactConn && c.enabled) : undefined;
  const list = picked ? [{ conn: picked, model: s.chat.compactModel || picked.model }, ...chain] : chain;
  if (!list.length) return "No AI connection is available to write the summary.";
  const turns: Turn[] = [
    {
      role: "system",
      content:
        "You write running summaries of a group conversation so it can continue with less text. Keep names, decisions, facts people shared, promises, open questions and the current topic. Leave out small talk. Write plain bullet points, under 300 words.",
    },
    {
      role: "user",
      content: `${prior ? `Summary so far:\n${prior}\n\n` : ""}Conversation to add:\n${older.map(asText).join("\n").slice(-60_000)}\n\nWrite the updated summary.`,
    },
  ];
  let lastErr = "";
  for (const { conn, model } of list) {
    if (!model) continue;
    try {
      let out = "";
      const r = await streamOnce(conn, model, keyOf(conn), turns, [], 0.2, (p) => (out += p), undefined, { numCtx: s.chat.numCtx || undefined });
      const summary = (r.text || out).replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      if (!summary) continue;
      setSummary(summary, older[older.length - 1].at);
      return `Compacted ${older.length} earlier message${older.length === 1 ? "" : "s"} into a summary. The last ${keep} stay word for word.`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  return `Couldn't compact. ${lastErr}`.trim();
}
