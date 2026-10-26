// Model connections. Everything the original Pandora Dee could talk to, plus more:
// several named connections at once, a fallback order, a model per character,
// streaming with tool calls (Ollama and OpenAI-compatible), and AICord characters.

import { outbound, type Via } from "./outbound.ts";

export type Kind = "ollama" | "openai" | "aicord";

export type Connection = {
  id: string;
  label: string;
  kind: Kind;
  baseUrl: string;
  /** Name of the key in Keys that holds the API key. Empty when none is needed. */
  keyName: string;
  /** The model to use when a character doesn't pick one. */
  model: string;
  enabled: boolean;
  /** How requests are sent (empty: the desktop relay). */
  via?: Via;
  /** AICord: an API key (works today) or "Sign in with AICord" (OAuth, for endpoints that accept it). */
  auth?: "key" | "oauth";
  /** AICord OAuth: this desktop's client ID (registered by the AICord team), extra scopes, and the token's details. */
  oauth?: { clientId: string; scopes: string[]; tokenName: string; expires?: number; scope?: string };
};

/** What goes in the Authorization header for this connection: its key from Keys, or its sign-in token. */
export function credential(c: Connection, env: Record<string, string>): string {
  if (c.kind === "aicord" && c.auth === "oauth") {
    const t = env[c.oauth?.tokenName || "AICORD_OAUTH_TOKEN"] ?? "";
    return t ? `Bearer ${t}` : "";
  }
  return c.keyName ? env[c.keyName] ?? "" : "";
}

export type ModelPrefs = {
  connections: Connection[];
  /** Connection ids, tried in this order until one answers. */
  order: string[];
  temperature: number;
  /** Let characters use tools (files, memory, journal, web, MCP, bridges). */
  tools: boolean;
  /** Most tool rounds in one reply. */
  maxSteps: number;
};

export const PRESETS: Omit<Connection, "id" | "model" | "enabled">[] = [
  { label: "Ollama on this computer", kind: "ollama", baseUrl: "http://localhost:11434", keyName: "" },
  { label: "Ollama Cloud", kind: "ollama", baseUrl: "https://ollama.com", keyName: "OLLAMA_API_KEY" },
  { label: "Groq", kind: "openai", baseUrl: "https://api.groq.com/openai/v1", keyName: "GROQ_API_KEY" },
  { label: "llama.cpp server", kind: "openai", baseUrl: "http://localhost:8080/v1", keyName: "" },
  { label: "LM Studio", kind: "openai", baseUrl: "http://localhost:1234/v1", keyName: "" },
  { label: "OpenRouter", kind: "openai", baseUrl: "https://openrouter.ai/api/v1", keyName: "OPENROUTER_API_KEY" },
  { label: "OpenAI-compatible (any)", kind: "openai", baseUrl: "https://", keyName: "OPENAI_API_KEY" },
  { label: "AICord characters", kind: "aicord", baseUrl: "https://aicordapp.com/api/v1", keyName: "AICORD_API_KEY" },
];

export const MODEL_DEFAULT: ModelPrefs = {
  connections: [{ id: "local", label: "Ollama on this computer", kind: "ollama", baseUrl: "http://localhost:11434", keyName: "", model: "", enabled: true }],
  order: ["local"],
  temperature: 0.8,
  tools: true,
  maxSteps: 6,
};

export type Scope = "device" | "network" | "cloud";

/** Where the words go when this address is used. */
export function scopeOf(url: string): Scope {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, "");
  } catch {
    return "cloud";
  }
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1" || /^127\./.test(host)) return "device";
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return "network";
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) || /\.(local|lan|home|ts\.net)$/.test(host)) return "network";
  return "cloud";
}

export const SCOPE_LABEL: Record<Scope, string> = {
  device: "On this computer",
  network: "On your network",
  cloud: "Online service",
};

/** Models that tend to work well, best first, used when nothing is chosen. */
const PREFER = [/gpt-oss/i, /qwen3/i, /kimi-k2/i, /llama-?3\.3|llama-?4/i, /deepseek/i, /glm-4/i, /mistral|devstral/i, /gemma3/i, /llama-?3/i];

export function pickModel(list: string[]) {
  for (const re of PREFER) {
    const hit = list.find((m) => re.test(m) && !/embed/i.test(m));
    if (hit) return hit;
  }
  return list.find((m) => !/embed/i.test(m)) ?? "";
}

// ---------- wire types ----------

export type ToolCall = { id: string; name: string; args: Record<string, unknown> };

export type Turn =
  | { role: "system"; content: string }
  /** images: base64 (no data: prefix), for vision models. */
  | { role: "user"; content: string; images?: { data: string; mime: string }[] }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; content: string; callId: string; name: string };

export type ToolSpec = { name: string; description: string; parameters: Record<string, unknown> };

/** `thinking`: what a reasoning model sent as its reasoning (apart from the reply). */
export type StreamResult = { text: string; toolCalls: ToolCall[]; thinking: string };

function base(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function authHeaders(kind: Kind, key: string): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (key) h.Authorization = kind === "aicord" ? key : `Bearer ${key}`;
  return h;
}

async function failure(res: Response, what: string) {
  let detail = "";
  try {
    const t = await res.text();
    try {
      const j = JSON.parse(t) as { error?: { message?: string } | string; message?: string };
      detail = (typeof j.error === "string" ? j.error : j.error?.message) || j.message || t;
    } catch {
      detail = t;
    }
  } catch {
    /* no body */
  }
  if (res.status === 401 || res.status === 403) return new Error(`${what} refused the key (${res.status}). Check it in Keys.`);
  if (res.status === 402) return new Error(`${what}: no credits left (402).`);
  return new Error(`${what} answered ${res.status}. ${detail.slice(0, 240)}`.trim());
}

const aicordIds = new Map<string, string>();

export async function listModels(c: Connection, key: string, signal?: AbortSignal): Promise<string[]> {
  if (c.kind === "ollama") {
    const res = await outbound(`${base(c.baseUrl)}/api/tags`, { headers: authHeaders(c.kind, key), signal }, c.via);
    if (!res.ok) throw await failure(res, c.label);
    const data = (await res.json()) as { models?: { name: string }[] };
    return (data.models ?? []).map((m) => m.name).sort();
  }
  if (c.kind === "aicord") {
    const res = await outbound(`${base(c.baseUrl)}/characters`, { headers: authHeaders(c.kind, key), signal }, c.via);
    if (!res.ok) throw await failure(res, c.label);
    const data = (await res.json()) as { id: string; name?: string }[];
    const names: string[] = [];
    for (const row of Array.isArray(data) ? data : []) {
      if (!row?.id) continue;
      const name = row.name || row.id;
      aicordIds.set(`${c.id}:${name}`, row.id);
      names.push(name);
    }
    return names;
  }
  const res = await outbound(`${base(c.baseUrl)}/models`, { headers: authHeaders(c.kind, key), signal }, c.via);
  if (!res.ok) throw await failure(res, c.label);
  const data = (await res.json()) as { data?: { id: string }[] };
  return (data.data ?? []).map((m) => m.id).sort();
}

export function explainError(err: unknown, c?: Connection): string {
  if (err instanceof DOMException && err.name === "AbortError") return "Stopped.";
  const msg = err instanceof Error ? err.message : String(err);
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg) && c) {
    if (c.kind === "ollama" && scopeOf(c.baseUrl) === "device")
      return "Couldn't reach Ollama on this computer. Start the Ollama app (or run `ollama serve`) and try again.";
    return `Couldn't reach ${c.label} at ${c.baseUrl}. Check the address, and that the server accepts requests from this page (CORS).`;
  }
  return msg;
}

function toOllama(turns: Turn[]) {
  return turns.map((t) => {
    if (t.role === "assistant")
      return {
        role: "assistant",
        content: t.content,
        ...(t.toolCalls?.length ? { tool_calls: t.toolCalls.map((tc) => ({ function: { name: tc.name, arguments: tc.args } })) } : {}),
      };
    if (t.role === "tool") return { role: "tool", content: t.content, tool_name: t.name };
    if (t.role === "user" && t.images?.length) return { role: "user", content: t.content, images: t.images.map((i) => i.data) };
    return { role: t.role, content: t.content };
  });
}

function toOpenAI(turns: Turn[]) {
  return turns.map((t) => {
    if (t.role === "assistant")
      return {
        role: "assistant",
        content: t.content || (t.toolCalls?.length ? null : ""),
        ...(t.toolCalls?.length
          ? { tool_calls: t.toolCalls.map((tc) => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: JSON.stringify(tc.args) } })) }
          : {}),
      };
    if (t.role === "tool") return { role: "tool", content: t.content, tool_call_id: t.callId };
    if (t.role === "user" && t.images?.length)
      return {
        role: "user",
        content: [{ type: "text", text: t.content }, ...t.images.map((i) => ({ type: "image_url", image_url: { url: `data:${i.mime};base64,${i.data}` } }))],
      };
    return { role: t.role, content: t.content };
  });
}

/** AICord has no system role or tools: context rides at the top of the first user turn. */
function toAICord(turns: Turn[]) {
  const out: { role: "user" | "character"; content: { type: "text"; text: string }[] }[] = [];
  let sys = "";
  const push = (role: "user" | "character", text: string) => {
    const last = out[out.length - 1];
    if (last && last.role === role) last.content.push({ type: "text", text });
    else out.push({ role, content: [{ type: "text", text }] });
  };
  for (const t of turns) {
    if (t.role === "system") sys += (sys ? "\n\n" : "") + t.content;
    else if (t.role === "assistant") {
      if (t.content.trim()) push("character", t.content);
    } else if (t.role === "tool") push("user", `[Result of ${t.name}]\n${t.content}`);
    else push("user", t.content);
  }
  if (sys) {
    const first = out.find((x) => x.role === "user");
    const note = `[Context from Pandora Dee Desktop]\n${sys}\n\n[Message]\n`;
    if (first) first.content[0] = { type: "text", text: note + first.content[0].text };
    else out.unshift({ role: "user", content: [{ type: "text", text: note }] });
  }
  return out;
}

let callSeq = 0;
const newCallId = () => `call_${Date.now().toString(36)}_${++callSeq}`;

function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const v = JSON.parse(raw) as unknown;
      return v && typeof v === "object" ? (v as Record<string, unknown>) : { value: v };
    } catch {
      return { input: raw };
    }
  }
  return {};
}

/** One model call, streamed. Text pieces go to onToken; tool calls come back in the result. */
export async function streamOnce(
  c: Connection,
  model: string,
  key: string,
  turns: Turn[],
  tools: ToolSpec[],
  temperature: number,
  onToken: (piece: string) => void,
  signal?: AbortSignal,
  extra: { numCtx?: number; think?: boolean; onThink?: (piece: string) => void } = {},
): Promise<StreamResult> {
  if (!model) throw new Error(`No model chosen for ${c.label}. Pick one in Settings → AI.`);

  if (c.kind === "aicord") {
    const id = aicordIds.get(`${c.id}:${model}`) ?? (/^[0-9a-f-]{36}$/i.test(model) ? model : "");
    if (!id) throw new Error("AICord: load the character list in Settings → AI first, then pick one.");
    const res = await outbound(`${base(c.baseUrl)}/chat`, {
      method: "POST",
      headers: authHeaders(c.kind, key),
      body: JSON.stringify({ character: id, messages: toAICord(turns) }),
      signal,
    }, c.via);
    if (!res.ok) throw await failure(res, c.label);
    const j = (await res.json()) as { text?: string };
    if (j.text) onToken(j.text);
    return { text: j.text ?? "", toolCalls: [], thinking: "" };
  }

  const ollama = c.kind === "ollama";
  const url = ollama ? `${base(c.baseUrl)}/api/chat` : `${base(c.baseUrl)}/chat/completions`;
  const toolDefs = tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
  const body = ollama
    ? { model, messages: toOllama(turns), stream: true, options: { temperature, ...(extra.numCtx ? { num_ctx: extra.numCtx } : {}) }, ...(toolDefs.length ? { tools: toolDefs } : {}), ...(extra.think ? { think: true } : {}) }
    : { model, messages: toOpenAI(turns), stream: true, temperature, ...(toolDefs.length ? { tools: toolDefs } : {}) };
  const res = await outbound(url, { method: "POST", headers: authHeaders(c.kind, key), body: JSON.stringify(body), signal }, c.via);
  if (!res.ok || !res.body) {
    if (res.status === 404 && ollama) throw new Error(`${c.label} doesn't have the model "${model}". Get it with: ollama pull ${model}`);
    if (res.status === 400 && toolDefs.length) {
      const err = await failure(res, c.label);
      if (/tool/i.test(err.message)) throw Object.assign(new Error(err.message), { noTools: true });
      throw err;
    }
    throw await failure(res, c.label);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  const calls: ToolCall[] = [];
  const partial = new Map<number, { id: string; name: string; args: string }>();
  let thinking = "";
  const think = (piece: string | undefined | null) => {
    if (!piece) return;
    thinking += piece;
    extra.onThink?.(piece);
  };
  const take = (piece: string | undefined | null) => {
    if (!piece) return;
    text += piece;
    onToken(piece);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (ollama) {
        const row = JSON.parse(line) as {
          message?: { content?: string; thinking?: string; tool_calls?: { function?: { name?: string; arguments?: unknown } }[] };
          error?: string;
        };
        if (row.error) throw new Error(row.error);
        think(row.message?.thinking);
        take(row.message?.content);
        for (const tc of row.message?.tool_calls ?? []) {
          if (tc.function?.name) calls.push({ id: newCallId(), name: tc.function.name, args: parseArgs(tc.function.arguments) });
        }
      } else {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        const row = JSON.parse(data) as {
          choices?: { delta?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null; tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[];
          error?: { message?: string };
        };
        if (row.error) throw new Error(row.error.message ?? "The model returned an error.");
        const delta = row.choices?.[0]?.delta;
        think(delta?.reasoning_content ?? delta?.reasoning);
        take(delta?.content);
        for (const tc of delta?.tool_calls ?? []) {
          const i = tc.index ?? 0;
          const cur = partial.get(i) ?? { id: "", name: "", args: "" };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name += tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          partial.set(i, cur);
        }
      }
    }
  }
  for (const p of [...partial.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1])) {
    if (p.name) calls.push({ id: p.id || newCallId(), name: p.name, args: parseArgs(p.args) });
  }
  return { text, toolCalls: calls, thinking };
}

/** A one-message chat request to this connection, exactly as the desktop would send it (for "Copy as…"). */
export function sampleRequest(c: Connection, key: string, model = c.model || "MODEL"): { url: string; method: string; headers: Record<string, string>; body: string } {
  const turns: Turn[] = [{ role: "user", content: "Hello!" }];
  if (c.kind === "aicord")
    return { url: `${base(c.baseUrl)}/chat`, method: "POST", headers: authHeaders(c.kind, key), body: JSON.stringify({ character: aicordIds.get(`${c.id}:${model}`) ?? model, messages: toAICord(turns) }) };
  if (c.kind === "ollama") return { url: `${base(c.baseUrl)}/api/chat`, method: "POST", headers: authHeaders(c.kind, key), body: JSON.stringify({ model, messages: toOllama(turns), stream: false }) };
  return { url: `${base(c.baseUrl)}/chat/completions`, method: "POST", headers: authHeaders(c.kind, key), body: JSON.stringify({ model, messages: toOpenAI(turns) }) };
}
