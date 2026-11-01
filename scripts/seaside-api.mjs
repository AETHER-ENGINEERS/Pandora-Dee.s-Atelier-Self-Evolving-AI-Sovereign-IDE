// A small client for a SEASIDE desktop's inbound API (Settings → Connections → Inbound API): for programs and AIs
// outside the desktop that want to talk with the characters. Used by seaside-talk.mjs (the command line) and
// seaside-mcp.mjs (an MCP server). Plain Node 18+, nothing to install.
//
// Where and who, from the environment (or passed in):
//   SEASIDE_API_URL         the desktop's API, e.g. http://127.0.0.1:8788 (default)
//   SEASIDE_API_TOKEN_FILE  a file holding the API token (Keys → the API's token on the desktop); or
//   SEASIDE_API_TOKEN       the token itself
//   SEASIDE_AS              speak as this character (one "voiced from outside"); blank: as an anonymous caller

import fs from "node:fs";

export function config(over = {}) {
  const env = process.env;
  const url = String(over.url || env.SEASIDE_API_URL || "http://127.0.0.1:8788").replace(/\/+$/, "");
  const file = over.tokenFile || env.SEASIDE_API_TOKEN_FILE;
  const token = String(over.token || env.SEASIDE_API_TOKEN || (file && fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "")).trim();
  return { url, token, as: String(over.as ?? env.SEASIDE_AS ?? "").trim() };
}

/** One request to the API: GET with its parameters; the token in the Authorization header (never in the address). */
export async function call(cfg, route, params = {}, seconds = 600) {
  if (!cfg.token) throw new Error("No API token: set SEASIDE_API_TOKEN_FILE (or SEASIDE_API_TOKEN).");
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  q.set("timeout", String(seconds));
  const r = await fetch(`${cfg.url}${route}?${q}`, { headers: { Authorization: `Bearer ${cfg.token}` }, signal: AbortSignal.timeout((seconds + 15) * 1000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error?.message || `The desktop answered ${r.status}.`);
  return j;
}

export const status = (cfg) => call(cfg, "/v1/status", {}, 30);
export const chats = (cfg) => call(cfg, "/v1/chats", {}, 30);
export const history = (cfg, limit = 20, session) => call(cfg, "/v1/history", { limit, session }, 30);
/** Say something in the room (as `as`, when given) and wait for the characters' answers. */
export const chat = (cfg, message, as = cfg.as) => call(cfg, "/v1/chat", { message, as });
/** Messages from the bridges (Vector, Discord) waiting for a character voiced from outside; take clears them. */
export const inbox = (cfg, take = false, as = cfg.as) => call(cfg, "/v1/inbox", { as, take: take ? 1 : "" }, 30);
/** Answer in a bridge chat as that character (it's marked with their name there). */
export const reply = (cfg, chat, message, replyTo, source = "vector", as = cfg.as) => call(cfg, "/v1/reply", { as, chat, message, reply_to: replyTo, source }, 60);
