// Live connections to MCP tool servers and to the Discord / Vector bridges.

import { McpClient } from "./mcp.ts";
import { desk, type BridgeId, type McpServer } from "./store.ts";
import { scopeOf } from "./model.ts";
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
  return scopeOf(server.url) === "device" || allowed(desk().privacy, "remote-tools");
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
    const c = await new McpClient(server.name, server.url, keyOf(server.keyName), (server.timeout ?? 60) * 1000, headers, () => server.via ?? desk().net.via).connect();
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

export function serverClients(): { server: McpServer; client: McpClient }[] {
  return desk()
    .mcp.filter((s) => s.enabled)
    .map((server) => ({ server, client: links.client(`mcp:${server.id}`) }))
    .filter((x): x is { server: McpServer; client: McpClient } => Boolean(x.client));
}
