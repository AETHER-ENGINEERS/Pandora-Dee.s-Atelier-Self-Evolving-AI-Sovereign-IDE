// Answers the inbound API (/v1/…): the desktop server collects requests, this does the work.

import { desk } from "./store.ts";
import { allowed } from "./privacy.ts";
import { isRunning, say } from "./agent.ts";
import { chatList, currentChat, loadChat } from "./chats.ts";

type Job = { id: string; route: string; params: Record<string, string> };

let active = false;
let token = 0;

async function reply(id: string, status: number, body: Record<string, unknown>) {
  await fetch("/api/inbound/reply", { method: "POST", body: JSON.stringify({ id, status, body }) });
}

const err = (code: string, message: string) => ({ ok: false, error: { code, message } });

function connection() {
  const c = desk().model.connections.find((x) => x.enabled);
  return c ? { provider: c.label, model: c.model || "(picked automatically)" } : null;
}

async function handle(job: Job) {
  const s = desk();
  const p = job.params;
  const open = () => ({ id: s.chatId, title: currentChat().title, messages: s.messages.length });
  if (job.route === "/v1/status") return reply(job.id, 200, { ok: true, busy: isRunning(), ...connection(), session: open(), version: "3.11.0" });
  if (job.route === "/v1/chats") return reply(job.id, 200, { ok: true, chats: chatList().map((c) => ({ id: c.id, title: c.title, updated: c.updated, messages: c.count, current: c.id === s.chatId })) });
  if (job.route === "/v1/history") {
    const id = p.session || s.chatId;
    if (!chatList().some((c) => c.id === id)) return reply(job.id, 404, err("unknown_chat", "No chat has that id. See /v1/chats."));
    const limit = Math.min(200, Math.max(1, Number(p.limit) || 20));
    const rows = (await loadChat(id)).filter((m) => m.kind !== "notice" && !m.pass).slice(-limit);
    return reply(job.id, 200, { ok: true, session: id, messages: rows.map((m) => ({ role: m.kind === "human" ? "user" : "assistant", name: m.name, text: m.text, at: m.at, ...(m.rating ? { rating: m.rating } : {}) })) });
  }
  if (job.route === "/v1/flows") return reply(job.id, 200, { ok: true, flows: [] });
  if (job.route === "/v1/flow") return reply(job.id, 404, err("unknown_flow", "Flows arrive in a later batch of the desktop."));
  if (job.route === "/v1/chat") {
    const message = String(p.message ?? p.q ?? p.text ?? p.prompt ?? "").trim();
    if (!message) return reply(job.id, 400, err("missing_message", "Send a message."));
    if (message.length > 20000) return reply(job.id, 413, err("too_long", "Messages are limited to 20,000 characters."));
    if (message.startsWith("/") && !message.startsWith("/skill:")) return reply(job.id, 400, err("slash", "Only /skill:name commands are accepted here."));
    if (isRunning()) return reply(job.id, 409, err("busy", "The characters are in the middle of something. Try again shortly."));
    if (!connection()) return reply(job.id, 503, err("no_model", "No AI connection is set up."));
    const started = Date.now();
    const before = s.messages.length;
    const run = say(message, "API");
    if (p.wait === "0") {
      void run;
      return reply(job.id, 202, { ok: true, accepted: true, session: { id: s.chatId } });
    }
    try {
      await run;
    } catch (e) {
      return reply(job.id, 502, err("agent", e instanceof Error ? e.message : String(e)));
    }
    const fresh = desk().messages.slice(before).filter((m) => m.kind === "character" && !m.pass);
    const text = fresh.map((m) => (fresh.length > 1 ? `${m.name}: ${m.text}` : m.text)).join("\n\n");
    const tools = p.tools === "0" ? undefined : fresh.flatMap((m) => (m.tools ?? []).map((t) => ({ name: t.name, ok: t.ok, note: t.note })));
    return reply(job.id, 200, {
      ok: true,
      session: { id: desk().chatId, title: currentChat().title, messages: desk().messages.length, updated: Date.now() },
      reply: text,
      error: null,
      model: fresh[0]?.via ?? null,
      elapsed_ms: Date.now() - started,
      ...(tools ? { tool_calls: tools } : {}),
    });
  }
  return reply(job.id, 404, err("not_found", "Unknown route."));
}

/** Tell the server how to listen, then answer requests while the API is on. */
export async function applyInbound() {
  const s = desk();
  const a = s.api;
  const on = a.on && allowed(s.privacy, "api");
  let tok = s.env[a.keyName] ?? "";
  if (on && !tok) {
    tok = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
    s.set({ env: { ...s.env, [a.keyName]: tok } });
  }
  const res = await fetch("/api/inbound/config", { method: "POST", body: JSON.stringify({ on, port: a.port, lan: a.lan, token: tok }) });
  const status = (await res.json()) as { ok?: boolean; listening?: boolean; error?: string };
  const mine = ++token;
  if (on && status.listening && !active) {
    active = true;
    void (async () => {
      while (mine === token && desk().api.on) {
        try {
          const r = await fetch("/api/inbound/next");
          const job = (await r.json()) as Job & { idle?: boolean };
          if (!job.idle) await handle(job);
        } catch {
          await new Promise((x) => setTimeout(x, 3000));
        }
      }
      active = false;
    })();
  }
  return status;
}
