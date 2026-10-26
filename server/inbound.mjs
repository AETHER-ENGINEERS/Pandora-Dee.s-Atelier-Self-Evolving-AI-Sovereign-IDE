// The inbound API (Classic's /v1 routes): other programs talk to the characters.
// This server checks the token and passes each request to the open desktop, which does the work.

import http from "node:http";
import crypto from "node:crypto";

const API = 1;
const ROUTES = ["/v1/status", "/v1/chats", "/v1/history", "/v1/chat", "/v1/flows", "/v1/flow"];

let server = null;
let cfg = { on: false, port: 8787, lan: false, token: "" };
const jobs = [];
const waiting = new Map();
let pollers = [];
let lastPoll = 0;

function json(res, code, body) {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

const fail = (res, code, err, message) => json(res, code, { ok: false, api: API, error: { code: err, message } });

function tokenOk(req, url) {
  const given = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "") || url.searchParams.get("token") || "";
  if (!cfg.token || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(cfg.token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function wake() {
  const job = jobs.shift();
  if (!job) return;
  const p = pollers.shift();
  if (p) p(job);
  else jobs.unshift(job);
}

function handle(req, res) {
  const url = new URL(req.url || "/", "http://x");
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.method !== "GET") return fail(res, 405, "method", "Only GET is supported.");
  if (["/", "/v1", "/v1/health"].includes(url.pathname)) {
    return json(res, 200, { ok: true, api: API, app: "pandora-dee-desktop", endpoints: ["/v1/health", ...ROUTES] });
  }
  if (!ROUTES.includes(url.pathname)) return fail(res, 404, "not_found", "Unknown route.");
  if (!tokenOk(req, url)) {
    return setTimeout(() => fail(res, 401, "token", "Missing or wrong token."), 400);
  }
  if (Date.now() - lastPoll > 30_000 && !pollers.length) return fail(res, 503, "desktop_closed", "The desktop isn't open, so nobody can answer. Open it and try again.");
  const params = Object.fromEntries(url.searchParams.entries());
  delete params.token;
  if (params.json) {
    try {
      const extra = JSON.parse(params.json);
      for (const [k, v] of Object.entries(extra)) if (!(k in params)) params[k] = typeof v === "string" ? v : JSON.stringify(v);
    } catch {
      return fail(res, 400, "bad_json", "The json parameter isn't valid JSON.");
    }
  }
  const id = crypto.randomUUID();
  const seconds = Math.min(1800, Math.max(1, Number(params.timeout) || 300));
  const timer = setTimeout(() => {
    waiting.delete(id);
    fail(res, 504, "timeout", "Still working: the answer will appear in the desktop. Check /v1/status and /v1/history.");
  }, seconds * 1000);
  waiting.set(id, (status, body) => {
    clearTimeout(timer);
    json(res, status, { api: API, ...body });
  });
  jobs.push({ id, route: url.pathname, params });
  wake();
}

export const inbound = {
  configure(next) {
    const changed = next.port !== cfg.port || next.lan !== cfg.lan || next.on !== cfg.on;
    cfg = { ...cfg, ...next };
    if (!changed && server) return { ok: true, listening: true, port: cfg.port };
    if (server) {
      server.close();
      server = null;
    }
    if (!cfg.on) return { ok: true, listening: false };
    return new Promise((resolve) => {
      const s = http.createServer(handle);
      s.on("error", (e) => resolve({ ok: false, error: e.code === "EADDRINUSE" ? `Port ${cfg.port} is already in use.` : e.message }));
      s.listen(cfg.port, cfg.lan ? "0.0.0.0" : "127.0.0.1", () => {
        server = s;
        resolve({ ok: true, listening: true, port: cfg.port, lan: cfg.lan });
      });
    });
  },
  /** The desktop asks for the next request (waits up to 25 seconds). */
  next() {
    lastPoll = Date.now();
    const job = jobs.shift();
    if (job) return Promise.resolve(job);
    return new Promise((resolve) => {
      const done = (j) => resolve(j);
      pollers.push(done);
      setTimeout(() => {
        pollers = pollers.filter((p) => p !== done);
        resolve(null);
      }, 25_000);
    });
  },
  reply(id, status, body) {
    const w = waiting.get(id);
    if (!w) return false;
    waiting.delete(id);
    w(status, body);
    return true;
  },
  status: () => ({ on: cfg.on, listening: Boolean(server), port: cfg.port, lan: cfg.lan }),
};
