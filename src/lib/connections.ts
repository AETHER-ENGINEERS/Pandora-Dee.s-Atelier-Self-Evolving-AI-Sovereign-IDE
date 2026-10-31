// Live connections to MCP tool servers and to the Discord / Vector bridges.

import { McpClient } from "./mcp.ts";
import { desk, type BridgeId, type McpServer } from "./store.ts";
import { scopeOf } from "./model.ts";
import { fromMcpJson } from "./mcptools.ts";
import { allowed } from "./privacy.ts";

export type LinkState = { state: "off" | "connecting" | "on" | "error"; error: string; tools: number; detail: string };

const OFF: LinkState = { state: "off", error: "", tools: 0, detail: "" };

const clients = new Map<string, McpClient>();
const states = new Map<string, LinkState>();
const listeners = new Set<() => void>();
let version = 0;

export const links = {
  version: () => version,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  state: (key: string) => states.get(key) ?? OFF,
  client: (key: string) => {
    const s = states.get(key);
    return s?.state === "on" ? clients.get(key) : undefined;
  },
};

function emit(key: string, s: LinkState) {
  states.set(key, s);
  version++;
  for (const fn of listeners) fn();
}

const keyOf = (name: string) => () => (name ? desk().env[name] ?? "" : "");

export function mcpAllowed(server: McpServer) {
  return Boolean(server.stdio) || scopeOf(server.url) === "device" || allowed(desk().privacy, "remote-tools");
}

/** A program server's spec as the desktop's server sees it, for allowing, starting and asking about it. */
const stdioBody = (server: McpServer, extra: Record<string, unknown> = {}) => ({
  id: server.id,
  name: server.name,
  owner: server.owner ?? "",
  command: server.stdio?.command,
  args: server.stdio?.args ?? [],
  env: server.stdio?.env ?? {},
  cwd: server.stdio?.cwd ?? "",
  ...extra,
});

async function stdioCall<T>(op: string, body: Record<string, unknown>): Promise<T> {
  const r = await fetch(`/api/mcp-stdio/${op}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `The desktop answered ${r.status}.`);
  return j as T;
}

export type StdioStatus = { running: boolean; allowed: boolean; exited?: string | null; log: string[] };
export const stdioStatus = (server: McpServer) => stdioCall<StdioStatus>("status", stdioBody(server));

/** The locksmith allows (or stops allowing) this exact program, from the desktop's own computer. */
export async function allowStdio(server: McpServer, allow = true) {
  await stdioCall("allow", stdioBody(server, { allow }));
  if (allow) await connectServer(server);
  else {
    await stdioCall("stop", { id: server.id }).catch(() => undefined);
    disconnect(`mcp:${server.id}`);
  }
}

/** Start the program with its ${KEY}s filled in from Keys, and give back the address to talk to it on. */
async function startStdio(server: McpServer) {
  const st = await stdioStatus(server);
  if (!st.allowed) {
    // what runs under this name changed (or was never allowed): nothing of it keeps running meanwhile
    await stdioCall("stop", { id: server.id }).catch(() => undefined);
    clients.delete(`mcp:${server.id}`);
  }
  if (!st.allowed) throw Object.assign(new Error(`Waiting for your OK: it runs ${server.stdio?.command} on this computer. Connections → Tool servers → Allow.`), { waiting: true });
  const env = desk().env;
  const names = new Set<string>();
  for (const v of [...(server.stdio?.args ?? []), ...Object.values(server.stdio?.env ?? {})]) for (const m of v.matchAll(/\$\{([A-Za-z0-9_]+)\}/g)) names.add(m[1]);
  const values = Object.fromEntries([...names].filter((n) => env[n] != null).map((n) => [n, env[n]]));
  await stdioCall("start", stdioBody(server, { values }));
  return `/api/mcp-stdio/rpc/${encodeURIComponent(server.id)}`;
}

export async function connectServer(server: McpServer) {
  const key = `mcp:${server.id}`;
  clients.get(key);
  if (!server.enabled) return emit(key, OFF);
  if (!mcpAllowed(server)) return emit(key, { ...OFF, state: "error", error: "This server isn't on this computer. Turn on “Tool servers off this computer” in Settings → Privacy first." });
  emit(key, { ...OFF, state: "connecting" });
  try {
    const headers = () => {
      const env = desk().env;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(server.headers ?? {})) out[k] = v.replace(/\$\{([A-Za-z0-9_]+)\}/g, (_, n: string) => env[n] ?? "");
      return out;
    };
    const url = server.stdio ? await startStdio(server) : server.url;
    const via = () => (server.stdio ? "browser" : server.via ?? desk().net.via);
    const c = await new McpClient(server.name, url, keyOf(server.keyName), (server.timeout ?? 60) * 1000, headers, via).connect();
    clients.set(key, c);
    emit(key, { state: "on", error: "", tools: c.tools.length, detail: c.serverName });
  } catch (e) {
    emit(key, { ...OFF, state: "error", error: e instanceof Error ? e.message : String(e) });
  }
}

export function disconnect(key: string) {
  clients.delete(key);
  emit(key, OFF);
}

export async function connectBridge(id: BridgeId) {
  const b = desk().bridges[id];
  const key = `bridge:${id}`;
  if (!b.enabled) return disconnect(key);
  if (!allowed(desk().privacy, "bridges")) {
    return emit(key, { ...OFF, state: "error", error: "Bridges are off in Settings → Privacy. Turning them on explains what they share." });
  }
  emit(key, { ...OFF, state: "connecting" });
  try {
    const c = await new McpClient(id === "discord" ? "Discord bridge" : "Vector bridge", b.url, keyOf(b.keyName), 60_000, () => ({}), () => desk().net.via).connect();
    clients.set(key, c);
    let detail = "";
    try {
      const raw = await c.call(id === "discord" ? "my_user" : "status");
      const me = JSON.parse(raw) as { name?: string; username?: string; npub?: string; display_name?: string };
      detail = me.name || me.username || me.display_name || me.npub || "";
    } catch {
      /* status is optional */
    }
    emit(key, { state: "on", error: "", tools: c.tools.length, detail });
  } catch (e) {
    emit(key, { ...OFF, state: "error", error: e instanceof Error ? e.message : String(e) });
  }
}

/** Each character's own servers follow her mcp.json (the file she brings from Classic, or edits in Files):
 *  rebuilt when the file changes, connected when enabled. Run at start and whenever files change. */
const lastMcpJson = new Map<string, string>();
export function syncCharacterMcp() {
  const s = desk();
  let servers = s.mcp;
  let changed = false;
  for (const c of s.allCharacters()) {
    const text = s.filesOf(c.id)["mcp.json"] ?? "";
    if (lastMcpJson.get(c.id) === text) continue;
    lastMcpJson.set(c.id, text);
    let mine: McpServer[] = [];
    try {
      mine = text.trim() ? fromMcpJson(text).map((m) => ({ ...m, id: `${c.id}--${m.name}`, owner: c.id })) : [];
    } catch {
      continue; // not valid JSON yet (she may be mid-edit): keep what she had
    }
    const before = servers.filter((m) => m.owner === c.id);
    if (JSON.stringify(before) === JSON.stringify(mine)) continue;
    servers = [...servers.filter((m) => m.owner !== c.id), ...mine];
    changed = true;
    for (const old of before) if (!mine.some((m) => m.id === old.id)) disconnect(`mcp:${old.id}`);
    for (const m of mine) if (m.enabled) void connectServer(m);
  }
  if (changed) s.set({ mcp: servers });
}

export function serverClients(): { server: McpServer; client: McpClient }[] {
  return desk()
    .mcp.filter((s) => s.enabled)
    .map((server) => ({ server, client: links.client(`mcp:${server.id}`) }))
    .filter((x): x is { server: McpServer; client: McpClient } => Boolean(x.client));
}
