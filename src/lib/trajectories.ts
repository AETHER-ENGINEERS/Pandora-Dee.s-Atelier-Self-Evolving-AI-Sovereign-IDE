// Trajectories: a log of each reply (prompt, tool calls, answer) for fine-tuning,
// kept on this computer as JSONL files under .pandora/trajectories. Off unless turned on.

import { desk } from "./store.ts";
import type { ToolSpec, Turn } from "./model.ts";
import { chatList, loadChat } from "./chats.ts";

const DIR = ".pandora/trajectories";

export type Trajectory = {
  /** The room message this became. Ratings are looked up by it. */
  id: string;
  at: number;
  chat: string;
  character: string;
  model: string;
  tools: ToolSpec[];
  messages: Turn[];
};

let chain: Promise<unknown> = Promise.resolve();

const dayOf = (at: number) => new Date(at).toISOString().slice(0, 10);
const url = (path: string) => `/api/vault/file?path=${encodeURIComponent(path)}`;

/** Add one reply to today's file (one at a time, so lines never interleave). */
export function record(t: Trajectory) {
  if (!desk().chat.trajectories) return;
  const clean: Trajectory = { ...t, messages: t.messages.map((m) => (m.role === "user" && m.images ? { role: "user", content: m.content } : m)) };
  chain = chain
    .then(async () => {
      const path = `${DIR}/${dayOf(t.at)}.jsonl`;
      const res = await fetch(url(path));
      const prev = res.ok ? await res.text() : "";
      await fetch(url(path), { method: "PUT", body: `${prev}${JSON.stringify(clean)}\n` });
    })
    .catch(() => undefined);
}

export async function readAll(): Promise<Trajectory[]> {
  const res = await fetch(`/api/vault/list?path=${encodeURIComponent(DIR)}`);
  if (!res.ok) return [];
  const files = ((await res.json()) as { name: string; dir: boolean }[]).filter((f) => !f.dir && f.name.endsWith(".jsonl")).sort((a, b) => a.name.localeCompare(b.name));
  const out: Trajectory[] = [];
  for (const f of files) {
    const r = await fetch(url(`${DIR}/${f.name}`));
    if (!r.ok) continue;
    for (const line of (await r.text()).split("\n")) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as Trajectory);
      } catch {
        /* a damaged line */
      }
    }
  }
  return out;
}

/** 👍 / 👎 from every saved chat, by message id. */
export async function ratings(): Promise<Map<string, 1 | -1>> {
  const map = new Map<string, 1 | -1>();
  for (const c of chatList()) for (const m of await loadChat(c.id)) if (m.rating) map.set(m.id, m.rating);
  return map;
}

export type Format = "openai" | "sharegpt";
export type Filter = "all" | "liked" | "not-disliked";

export function toOpenAIRow(t: Trajectory) {
  const messages = t.messages.map((m) => {
    if (m.role === "assistant")
      return {
        role: "assistant",
        content: m.content,
        ...(m.toolCalls?.length ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args) } })) } : {}),
      };
    if (m.role === "tool") return { role: "tool", tool_call_id: m.callId, content: m.content };
    return { role: m.role, content: m.content };
  });
  return { messages, ...(t.tools.length ? { tools: t.tools.map((f) => ({ type: "function", function: f })) } : {}) };
}

export function toShareGPTRow(t: Trajectory) {
  const conversations: { from: string; value: string }[] = [];
  for (const m of t.messages) {
    if (m.role === "system") conversations.push({ from: "system", value: m.content });
    else if (m.role === "user") conversations.push({ from: "human", value: m.content });
    else if (m.role === "tool") conversations.push({ from: "observation", value: m.content });
    else {
      if (m.content.trim()) conversations.push({ from: "gpt", value: m.content });
      for (const c of m.toolCalls ?? []) conversations.push({ from: "function_call", value: JSON.stringify({ name: c.name, arguments: c.args }) });
    }
  }
  return { conversations, ...(t.tools.length ? { tools: JSON.stringify(t.tools) } : {}) };
}

export async function exportJsonl(format: Format, filter: Filter): Promise<{ text: string; count: number }> {
  const all = await readAll();
  const rated = filter === "all" ? new Map() : await ratings();
  const kept = all.filter((t) => (filter === "liked" ? rated.get(t.id) === 1 : filter === "not-disliked" ? rated.get(t.id) !== -1 : true));
  const rows = kept.map((t) => JSON.stringify(format === "openai" ? toOpenAIRow(t) : toShareGPTRow(t)));
  return { text: rows.length ? `${rows.join("\n")}\n` : "", count: rows.length };
}
