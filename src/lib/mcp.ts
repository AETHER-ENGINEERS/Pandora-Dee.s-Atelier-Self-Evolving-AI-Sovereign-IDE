// MCP over streamable HTTP. Used for MCP tool servers and for the Discord and Vector
// bridges, which are MCP servers with a bearer token.

import { outbound, type Via } from "./outbound.ts";

const PROTOCOL = "2025-06-18";

export type McpTool = { name: string; description?: string; inputSchema?: Record<string, unknown> };

export class McpClient {
  private seq = 0;
  private session: string | null = null;
  private protocol = PROTOCOL;
  private ready = false;
  tools: McpTool[] = [];
  serverName = "";
  instructions = "";

  constructor(
    public name: string,
    public url: string,
    private token: () => string,
    private timeoutMs = 60_000,
    private extraHeaders: () => Record<string, string> = () => ({}),
    private via: () => Via = () => "desktop",
  ) {}

  private headers() {
    const h: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
    const t = this.token();
    if (t) h.Authorization = /^bearer /i.test(t) ? t : `Bearer ${t}`;
    Object.assign(h, this.extraHeaders());
    if (this.session) h["Mcp-Session-Id"] = this.session;
    if (this.ready) h["MCP-Protocol-Version"] = this.protocol;
    return h;
  }

  private async post(body: Record<string, unknown>, notify = false): Promise<unknown> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      let res: Response;
      try {
        res = await outbound(this.url, { method: "POST", headers: this.headers(), body: JSON.stringify(body), signal: ctrl.signal, timeout: Math.ceil(this.timeoutMs / 1000) + 5 }, this.via());
      } catch (e) {
        throw new Error(ctrl.signal.aborted ? `${this.name}: no answer within ${this.timeoutMs / 1000}s` : `${this.name}: couldn't reach ${this.url}. ${e instanceof Error ? e.message : ""}`.trim());
      }
      const sid = res.headers.get("mcp-session-id");
      if (sid) this.session = sid;
      if (res.status === 404 && this.session && body.method !== "initialize") throw Object.assign(new Error("session expired"), { expired: true });
      if (res.status === 401 || res.status === 403) throw new Error(`${this.name} refused the token (${res.status}). Check it in Keys.`);
      if (!res.ok && res.status !== 202) throw new Error(`${this.name} answered ${res.status}.`);
      if (notify || res.status === 202) return null;
      const type = res.headers.get("content-type") ?? "";
      if (type.includes("text/event-stream")) return await this.readEvents(res, body.id as number);
      const text = await res.text();
      if (!text.trim()) return null;
      const json = JSON.parse(text) as unknown;
      const msg = (Array.isArray(json) ? json.find((x: { id?: number }) => x.id === body.id) : json) as { result?: unknown; error?: { message?: string } };
      if (msg?.error) throw new Error(`${this.name}: ${msg.error.message ?? "error"}`);
      return msg?.result;
    } finally {
      clearTimeout(timer);
    }
  }

  private async readEvents(res: Response, id: number): Promise<unknown> {
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let data: string[] = [];
    const handle = (raw: string) => {
      const parsed = JSON.parse(raw) as unknown;
      for (const x of (Array.isArray(parsed) ? parsed : [parsed]) as { id?: number; result?: unknown; error?: { message?: string } }[]) {
        if (x.id === id && (x.result !== undefined || x.error)) {
          if (x.error) throw new Error(`${this.name}: ${x.error.message ?? "error"}`);
          return { done: true, result: x.result };
        }
      }
      return null;
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.search(/\r?\n/)) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + (buf[i] === "\r" ? 2 : 1));
        if (line === "") {
          if (data.length) {
            const out = handle(data.join("\n"));
            data = [];
            if (out) {
              reader.cancel().catch(() => {});
              return out.result;
            }
          }
        } else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
    }
    if (data.length) {
      const out = handle(data.join("\n"));
      if (out) return out.result;
    }
    throw new Error(`${this.name}: the stream ended without an answer`);
  }

  async connect() {
    const r = (await this.post({
      jsonrpc: "2.0",
      id: ++this.seq,
      method: "initialize",
      params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "pandora-dee-desktop", version: "3.0" } },
    })) as { protocolVersion?: string; serverInfo?: { name?: string }; instructions?: string } | null;
    if (!r) throw new Error(`${this.name}: no answer to initialize`);
    this.protocol = r.protocolVersion ?? PROTOCOL;
    this.serverName = r.serverInfo?.name ?? "";
    this.instructions = r.instructions ?? "";
    this.ready = true;
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized" }, true).catch(() => {});
    const list = (await this.request("tools/list", {})) as { tools?: McpTool[] } | null;
    this.tools = list?.tools ?? [];
    return this;
  }

  async request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const send = () => this.post({ jsonrpc: "2.0", id: ++this.seq, method, params });
    try {
      return await send();
    } catch (e) {
      if ((e as { expired?: boolean }).expired) {
        this.session = null;
        this.ready = false;
        await this.connect();
        return await send();
      }
      throw e;
    }
  }

  resources = {
    list: async () => ((await this.request("resources/list", {})) as { resources?: unknown[] } | null)?.resources ?? [],
    templates: async () => ((await this.request("resources/templates/list", {})) as { resourceTemplates?: unknown[] } | null)?.resourceTemplates ?? [],
    read: async (uri: string) => {
      const r = (await this.request("resources/read", { uri })) as { contents?: { uri?: string; text?: string; blob?: string; mimeType?: string }[] } | null;
      return (r?.contents ?? []).map((c) => (c.text != null ? c.text : `[${c.mimeType ?? "binary"} ${c.blob?.length ?? 0} base64 characters]`)).join("\n");
    },
  };

  /** Call a tool and return its text. Throws when the tool reports an error. */
  async call(name: string, args: Record<string, unknown> = {}): Promise<string> {
    const r = (await this.request("tools/call", { name, arguments: args })) as {
      content?: { type: string; text?: string }[];
      isError?: boolean;
    } | null;
    const text = (r?.content ?? []).map((c) => (c.type === "text" ? c.text ?? "" : `[${c.type}]`)).join("\n");
    if (r?.isError) throw new Error(text || `${name} failed`);
    return text;
  }
}

export function parseJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
