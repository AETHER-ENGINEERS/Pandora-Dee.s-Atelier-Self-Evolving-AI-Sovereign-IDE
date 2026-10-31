// Pairing: Classic (pandora-dee, jade-vault) opened on its own, in a plain browser tab, can use this desktop's
// relay to get past CORS. Only pages holding a pairing token may; the person makes each token on the desktop's own
// computer, names it, and can remove it at any time. Tokens are kept only as their SHA-256, so the file can't be
// used to pair anything. A paired page gets the relay and nothing else: it can't reach the desktop's own server.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const hash = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");

export function createPairs({ file }) {
  const read = () => {
    try {
      const list = JSON.parse(fs.readFileSync(file(), "utf8"));
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  };
  const write = (list) => {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    const tmp = `${file()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
    fs.renameSync(tmp, file());
  };
  // last use is noted at most once a minute per pairing, so busy pages don't keep rewriting the file
  const noted = new Map();

  /** What the person sees: names and dates, never tokens. */
  const list = () => read().map(({ id, name, created, used, origin }) => ({ id, name, created, used: used ?? 0, origin: origin ?? "" }));

  /** A new pairing. The token is shown once, here, and never again. */
  function add(name) {
    const token = `pdd_${crypto.randomBytes(32).toString("base64url")}`;
    const entry = { id: crypto.randomBytes(6).toString("hex"), name: String(name || "Classic").trim().slice(0, 60) || "Classic", hash: hash(token), created: Date.now(), used: 0, origin: "" };
    write([...read(), entry]);
    return { id: entry.id, name: entry.name, token };
  }

  function remove(id) {
    const before = read();
    const after = before.filter((p) => p.id !== String(id));
    if (after.length !== before.length) write(after);
    return { removed: before.length - after.length };
  }

  /** The pairing this request's token belongs to, or null. Notes when and from which page it was used. */
  function check(req) {
    const m = /^Bearer\s+(pdd_[A-Za-z0-9_-]{20,})$/.exec(String(req.headers.authorization || ""));
    if (!m) return null;
    const h = hash(m[1]);
    const all = read();
    const hit = all.find((p) => p.hash.length === h.length && crypto.timingSafeEqual(Buffer.from(p.hash), Buffer.from(h)));
    if (!hit) return null;
    const now = Date.now();
    if (now - (noted.get(hit.id) ?? 0) > 60_000) {
      noted.set(hit.id, now);
      hit.used = now;
      hit.origin = String(req.headers.origin || "").slice(0, 200);
      write(all);
    }
    return { id: hit.id, name: hit.name };
  }

  return { list, add, remove, check };
}

/** CORS for paired pages: whichever page asks (the token decides, not the origin), the relay's own headers readable,
 *  and Chrome's private-network permission, since the desktop is on this computer or the home network. */
export function pairedCors(req, res) {
  const origin = String(req.headers.origin || "");
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Expose-Headers", "X-Relay-Status, X-Relay-Headers");
  res.setHeader("Access-Control-Max-Age", "600");
  if (req.headers["access-control-request-private-network"]) res.setHeader("Access-Control-Allow-Private-Network", "true");
}
