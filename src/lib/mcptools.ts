// MCP tools the way Classic exposes them: direct, deferred (found with tool_search), codemode
// (called from a sandboxed script) or hidden, per server and per tool.

import { desk, type Exposure, type McpServer } from "./store.ts";
import { serverClients } from "./connections.ts";
import { scopeOf, type ToolSpec } from "./model.ts";
import { allowed, blockedBecause } from "./privacy.ts";
import type { McpClient, McpTool } from "./mcp.ts";

export type McpEntry = { name: string; server: McpServer; client: McpClient; tool: McpTool; exposure: Exposure };

const norm = (s: string) => s.replace(/[^A-Za-z0-9_]/g, "_");
export const mcpName = (server: string, tool: string) => `mcp__${norm(server)}__${norm(tool)}`.slice(0, 64);

function exposureOf(server: McpServer, tool: string): Exposure {
  const map = server.toolExposure ?? {};
  if (map[tool]) return map[tool];
  for (const [pat, ex] of Object.entries(map)) {
    if (pat.includes("*") && new RegExp(`^${pat.split("*").map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`).test(tool)) return ex;
  }
  return server.exposure ?? "codemode";
}

/** Every MCP tool from connected servers, with how it's exposed. */
export function allMcp(): McpEntry[] {
  const out: McpEntry[] = [];
  for (const { server, client } of serverClients()) {
    for (const tool of client.tools) out.push({ name: mcpName(server.name, tool.name), server, client, tool, exposure: exposureOf(server, tool.name) });
  }
  return out;
}

function guard(server: McpServer) {
  if (scopeOf(server.url) !== "device" && !allowed(desk().privacy, "remote-tools")) throw new Error(blockedBecause(desk().privacy, "remote-tools"));
}

export async function callMcp(entry: McpEntry, args: Record<string, unknown>) {
  guard(entry.server);
  return entry.client.call(entry.tool.name, args);
}

export function specOf(e: McpEntry): ToolSpec {
  return {
    name: e.name,
    description: `[${e.server.name}] ${e.tool.description ?? e.tool.name}`.slice(0, 1000),
    parameters: (e.tool.inputSchema as Record<string, unknown>) ?? { type: "object", properties: {} },
  };
}

/** Rank tools by how well their name and description match words. */
export function searchMcp(query: string, list = allMcp(), limit = 8) {
  const words = query.toLowerCase().split(/\W+/).filter(Boolean);
  return list
    .filter((e) => e.exposure !== "hidden")
    .map((e) => {
      const hay = `${e.server.name} ${e.tool.name} ${e.tool.description ?? ""}`.toLowerCase();
      return { e, score: words.reduce((n, w) => n + (hay.includes(w) ? (e.tool.name.toLowerCase().includes(w) ? 3 : 1) : 0), 0) };
    })
    .filter((x) => x.score > 0 || !words.length)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.e);
}

// ---------- codemode: a sandboxed script that can call tools, nothing else ----------

const WORKER = `
const pending = new Map(); let seq = 0; const logs = []; const stash = {};
self.fetch = undefined; self.XMLHttpRequest = undefined; self.WebSocket = undefined; self.EventSource = undefined; self.importScripts = undefined;
const call = (op, args) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); postMessage({ op, id, args }); });
self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'reply') { const p = pending.get(m.id); if (!p) return; pending.delete(m.id); m.error ? p.rej(new Error(m.error)) : p.res(m.value); return; }
  if (m.type !== 'run') return;
  const ALL_TOOLS = m.tools;
  const tools = new Proxy({}, { get: (_, name) => (args = {}) => call('call', { name: String(name), args }) });
  const searchTools = (q, limit = 8) => { const w = String(q).toLowerCase().split(/\\W+/).filter(Boolean); return ALL_TOOLS.map(t => ({ t, s: w.reduce((n, x) => n + ((t.name + ' ' + t.description).toLowerCase().includes(x) ? 1 : 0), 0) })).filter(x => x.s > 0 || !w.length).sort((a, b) => b.s - a.s).slice(0, limit).map(x => ({ name: x.t.name, description: x.t.description })); };
  const describeTool = (name) => ALL_TOOLS.find(t => t.name === name) || null;
  const describeNamespace = () => [...new Set(ALL_TOOLS.map(t => t.name.split('__')[1]))].map(s => ({ server: s, tools: ALL_TOOLS.filter(t => t.name.split('__')[1] === s).map(t => t.name) }));
  const store = (k, v) => { stash[k] = v; }; const load = (k) => stash[k];
  const text = (r) => typeof r === 'string' ? r : JSON.stringify(r, null, 1);
  const image = (r) => r;
  const out = (...a) => logs.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(x, null, 1)).join(' '));
  const console = { log: out, info: out, warn: out, error: out };
  try {
    const fn = new (Object.getPrototypeOf(async function () {}).constructor)('tools', 'searchTools', 'describeTool', 'describeNamespace', 'ALL_TOOLS', 'store', 'load', 'text', 'image', 'console', m.code);
    const value = await fn(tools, searchTools, describeTool, describeNamespace, ALL_TOOLS, store, load, text, image, console);
    postMessage({ op: 'done', logs, value: value === undefined ? undefined : text(value) });
  } catch (err) { postMessage({ op: 'done', logs, error: String(err && err.message || err) }); }
};`;

export async function runCodemode(code: string, timeoutSec = 60): Promise<string> {
  const list = allMcp().filter((e) => e.exposure !== "hidden");
  const worker = new Worker(URL.createObjectURL(new Blob([WORKER], { type: "text/javascript" })));
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      worker.terminate();
      resolve(`Stopped after ${timeoutSec} seconds.`);
    }, Math.min(300, timeoutSec) * 1000);
    worker.onmessage = async (e: MessageEvent) => {
      const m = e.data as { op: string; id?: number; args?: { name: string; args: Record<string, unknown> }; logs?: string[]; value?: string; error?: string };
      if (m.op === "call" && m.id) {
        const entry = list.find((x) => x.name === m.args?.name || `${x.server.name}__${x.tool.name}` === m.args?.name);
        try {
          if (!entry) throw new Error(`No tool called ${m.args?.name}. Use searchTools() to find one.`);
          const raw = await callMcp(entry, m.args?.args ?? {});
          let value: unknown = raw;
          try {
            value = JSON.parse(raw);
          } catch {
            /* plain text */
          }
          worker.postMessage({ type: "reply", id: m.id, value });
        } catch (err) {
          worker.postMessage({ type: "reply", id: m.id, error: err instanceof Error ? err.message : String(err) });
        }
      }
      if (m.op === "done") {
        window.clearTimeout(timer);
        worker.terminate();
        const parts = [...(m.logs ?? [])];
        if (m.value !== undefined) parts.push(m.value);
        if (m.error) parts.push(`Error: ${m.error}`);
        resolve(parts.join("\n").slice(0, 20000) || "(the script returned nothing; console.log or return what you need)");
      }
    };
    worker.postMessage({ type: "run", code, tools: list.map((e) => ({ name: e.name, description: (e.tool.description ?? "").slice(0, 400), inputSchema: e.tool.inputSchema ?? {} })) });
  });
}

// ---------- resources ----------

export async function listResources(templates = false) {
  const out: string[] = [];
  for (const { server, client } of serverClients()) {
    try {
      guard(server);
      const list = templates ? await client.resources.templates() : await client.resources.list();
      out.push(`## ${server.name}\n${JSON.stringify(list, null, 1)}`);
    } catch (e) {
      out.push(`## ${server.name}\n(${e instanceof Error ? e.message : e})`);
    }
  }
  return out.join("\n\n") || "No MCP servers are connected.";
}

export async function readResource(serverName: string, uri: string) {
  const found = serverClients().find(({ server }) => server.name === serverName || norm(server.name) === serverName);
  if (!found) throw new Error(`No connected server called ${serverName}.`);
  guard(found.server);
  return (await found.client.resources.read(uri)).slice(0, 20000);
}

/** mcp.json, the format Classic and other tools use. */
export function toMcpJson(servers: McpServer[]) {
  const mcpServers: Record<string, unknown> = {};
  for (const s of servers)
    mcpServers[s.name] = {
      url: s.url,
      ...(s.headers && Object.keys(s.headers).length ? { headers: s.headers } : {}),
      ...(s.keyName ? { headers: { ...(s.headers ?? {}), Authorization: `Bearer \${${s.keyName}}` } } : {}),
      enabled: s.enabled,
      exposure: s.exposure ?? "codemode",
      ...(s.toolExposure && Object.keys(s.toolExposure).length ? { toolExposure: s.toolExposure } : {}),
      ...(s.timeout ? { timeout: s.timeout } : {}),
      ...(s.description ? { description: s.description } : {}),
    };
  return JSON.stringify({ mcpServers }, null, 2);
}

export function fromMcpJson(text: string): McpServer[] {
  const j = JSON.parse(text) as { mcpServers?: Record<string, { url?: string; headers?: Record<string, string>; enabled?: boolean; exposure?: Exposure; toolExposure?: Record<string, Exposure>; timeout?: number; description?: string; command?: string }> };
  const out: McpServer[] = [];
  for (const [name, c] of Object.entries(j.mcpServers ?? {})) {
    if (!c.url) continue; // stdio servers can't run in a web page; wrap them with supergateway
    out.push({
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: norm(name),
      url: c.url,
      keyName: "",
      enabled: c.enabled !== false,
      exposure: c.exposure ?? "codemode",
      toolExposure: c.toolExposure,
      headers: c.headers,
      timeout: c.timeout,
      description: c.description,
    });
  }
  return out;
}
