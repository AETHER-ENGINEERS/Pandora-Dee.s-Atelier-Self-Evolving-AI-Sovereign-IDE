// Answers the inbound API (/v1/…): the desktop server collects requests, this does the work.

import { desk } from "./store.ts";
import { allowed } from "./privacy.ts";
import { isRunning, outsideInbox, replyAsOutside, say, speakAs } from "./agent.ts";
import { chatList, currentChat, loadChat } from "./chats.ts";
import { holdsHeart } from "./heart.ts";

type Job = { id: string; route: string; params: Record<string, string> };

let active = false;
// whether this page should be collecting requests (set each time the API is set up; the one loop reads it)
let wanted = false;

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
  if (job.route === "/v1/status") return reply(job.id, 200, { ok: true, busy: isRunning(), ...connection(), session: open(), version: "3.14.0" });
  if (job.route === "/v1/chats") return reply(job.id, 200, { ok: true, chats: chatList().map((c) => ({ id: c.id, title: c.title, updated: c.updated, messages: c.count, current: c.id === s.chatId })) });
  if (job.route === "/v1/history") {
    const id = p.session || s.chatId;
    if (!chatList().some((c) => c.id === id)) return reply(job.id, 404, err("unknown_chat", "No chat has that id. See /v1/chats."));
    const limit = Math.min(200, Math.max(1, Number(p.limit) || 20));
    const rows = (await loadChat(id)).filter((m) => m.kind !== "notice" && !m.pass).slice(-limit);
    return reply(job.id, 200, { ok: true, session: id, messages: rows.map((m) => ({ role: m.kind === "human" ? "user" : "assistant", name: m.name, text: m.text, at: m.at, ...(m.rating ? { rating: m.rating } : {}) })) });
  }
  // a character voiced from outside: what's waiting for them from the bridges, and answering there
  if (job.route === "/v1/inbox" || job.route === "/v1/reply") {
    const want = String(p.as ?? "").trim().toLowerCase();
    const c = s.allCharacters().find((x) => x.outside && (x.id === want || x.name.toLowerCase() === want || x.short.toLowerCase() === want));
    if (!c) return reply(job.id, 404, err("unknown_character", "Say which character voiced from outside (as=…)."));
    if (job.route === "/v1/inbox") return reply(job.id, 200, { ok: true, character: c.id, waiting: outsideInbox(c.id, p.take === "1") });
    const message = String(p.message ?? "").trim();
    if (!p.chat || !message) return reply(job.id, 400, err("missing", "Send chat (the chat's id) and message."));
    try {
      await replyAsOutside(c.id, p.source === "discord" ? "discord" : "vector", String(p.chat), message, p.reply_to ? String(p.reply_to) : undefined);
    } catch (e) {
      return reply(job.id, 409, err("bridge", e instanceof Error ? e.message : String(e)));
    }
    return reply(job.id, 200, { ok: true, sent: true });
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
    // `as`: a character voiced from outside (by id or name) says it, instead of an anonymous caller
    let as = "";
    if (p.as) {
      const want = String(p.as).trim().toLowerCase();
      const c = s.allCharacters().find((x) => x.outside && (x.id === want || x.name.toLowerCase() === want || x.short.toLowerCase() === want));
      if (!c) return reply(job.id, 404, err("unknown_character", "No character voiced from outside has that id or name (Characters → profile → Voiced from outside)."));
      if (!s.roomCharacters().some((x) => x.id === c.id)) s.join(c.id);
      as = c.id;
    }
    const started = Date.now();
    const before = s.messages.length;
    const run = as ? speakAs(as, message) : say(message, "API");
    if (p.wait === "0") {
      void run;
      return reply(job.id, 202, { ok: true, accepted: true, session: { id: s.chatId } });
    }
    try {
      await run;
    } catch (e) {
      return reply(job.id, 502, err("agent", e instanceof Error ? e.message : String(e)));
    }
    const fresh = desk().messages.slice(before).filter((m) => m.kind === "character" && !m.pass && m.who !== as);
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
  // setting it up again (React runs start-up effects twice in development) keeps the loop that's running; only
  // switching the API off stops it
  wanted = Boolean(on && status.listening);
  if (wanted && !active) {
    active = true;
    void (async () => {
      while (wanted && desk().api.on) {
        try {
          // one page answers: the one holding the heart (lib/heart.ts)
          if (!holdsHeart()) {
            await new Promise((x) => setTimeout(x, 3000));
            continue;
          }
          const r = await fetch("/api/inbound/next");
          const job = (await r.json()) as Job & { idle?: boolean; off?: boolean };
          // the desktop's server restarted (Vite does, when a server file changes): set the API up there again
          if (job.off) {
            await applyInbound();
            await new Promise((x) => setTimeout(x, 1000));
          } else if (!job.idle) await handle(job);
        } catch {
          await new Promise((x) => setTimeout(x, 3000));
        }
      }
      active = false;
    })();
  }
  return status;
}
