// When a server says the prompt is too long: learn the model's real window from the error, drop the oldest turns
// and try again, as Classic's context guard does. Pure, so the logic tests can run it.

import type { Turn } from "./model.ts";

/** Rough token count: about four characters a token (the same measure as context.ts). */
const tok = (text: string) => Math.ceil(text.length / 4);

/** The wordings seen so far: Ollama ("prompt is too long"), Ollama Cloud ("prompt too long; exceeded max context
 *  length by N tokens"), OpenAI-style servers ("maximum context length", context_length_exceeded) and llama.cpp. */
export const isCtxError = (msg: string) =>
  /prompt (?:is )?too long|(?:max|maximum) context length|context[_ ]length[_ ]exceeded|exceeds? (?:the )?(?:available )?context|input is too long|too many tokens/i.test(msg);

/** How big a request is, tools included. */
export function sizeOf(turns: Turn[], toolsJson = "") {
  return tok(toolsJson) + turns.reduce((n, t) => n + tok(t.content) + 6 + (t.role === "assistant" && t.toolCalls ? tok(JSON.stringify(t.toolCalls)) : 0), 0);
}

const num = (s: string) => Number(s.replace(/,/g, ""));

/** What the error says about the real window. "Exceeded … by N tokens" is how far over the prompt went, not the
 *  limit; a stated limit is used as it is; otherwise assume a quarter less than what was sent. Kept 10% under. */
export function limitFrom(msg: string, sent: number) {
  const over = /(?:exceed(?:s|ed)?|over)\b[^.;\n]{0,40}?\bby\s+(\d[\d,]*)\s*tokens?/i.exec(msg);
  const stated = /(?:maximum context length|context length|context window) (?:is |of )?(\d[\d,]*)/i.exec(msg);
  const n = over ? sent - num(over[1]) : stated ? num(stated[1]) : sent * 0.75;
  return Math.max(2048, Math.floor(n * 0.9));
}

/** Learned windows, per connection and model, for the rest of this session. */
const learned = new Map<string, number>();
export function learnLimit(key: string, msg: string, sent: number) {
  const n = Math.min(learned.get(key) ?? Infinity, limitFrom(msg, sent));
  learned.set(key, n);
  return n;
}
export const learnedLimit = (key: string) => learned.get(key);

/** Drops the oldest turns between the system prompt and the message being answered (a tool call goes together with
 *  its results), then shortens long tool results, until the request fits. Changes `turns` in place; false when even
 *  that isn't enough. */
export function fitTurns(turns: Turn[], limit: number, toolsJson = "") {
  if (sizeOf(turns, toolsJson) <= limit) return true;
  const lastUser = turns.map((t) => t.role).lastIndexOf("user");
  const first = turns[0]?.role === "system" ? 1 : 0;
  let keepFrom = lastUser >= first ? lastUser : Math.max(first, turns.length - 1);
  while (sizeOf(turns, toolsJson) > limit && keepFrom > first) {
    let n = 1;
    while (first + n < keepFrom && turns[first + n].role === "tool") n++;
    turns.splice(first, n);
    keepFrom -= n;
  }
  for (const t of turns) if (sizeOf(turns, toolsJson) > limit && t.role === "tool" && t.content.length > 2000) t.content = `${t.content.slice(0, 2000)}\n[…cut to fit the model's window]`;
  return sizeOf(turns, toolsJson) <= limit;
}
