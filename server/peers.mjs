// Linked servers: SEASIDE servers on different devices (one per device) that know each other, so PADS shows every
// device of the account across all of them, and "Send to" reaches devices and vaults on the others.
//
// Linking is done on each server's own computer: one makes an invite code (single use, 15 minutes), the other is given
// its address and the code. Each side then holds a token for calling the other, and keeps only the SHA-256 of the
// token it handed out, so this file can't be used to call this server. Unlinking on either side ends it there.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

const INVITE_MS = 15 * 60_000;
const hash = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");
const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const newToken = () => `pdp_${crypto.randomBytes(32).toString("base64url")}`;
const clip = (s, n) => String(s ?? "").trim().slice(0, n);
/** An address another server can be reached at: http(s), a host, maybe a port; nothing else. */
export function cleanUrl(u) {
  try {
    const x = new URL(String(u));
    if (!/^https?:$/.test(x.protocol) || x.username || x.password) return "";
    return `${x.protocol}//${x.host}`;
  } catch {
    return "";
  }
}

export function createPeers({ file }) {
  const read = () => {
    try {
      const j = JSON.parse(fs.readFileSync(file(), "utf8"));
      return { me: j.me, invites: Array.isArray(j.invites) ? j.invites : [], peers: Array.isArray(j.peers) ? j.peers : [] };
    } catch {
      return { me: null, invites: [], peers: [] };
    }
  };
  const write = (d) => {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(`${file()}.tmp`, JSON.stringify(d, null, 1));
    fs.renameSync(`${file()}.tmp`, file());
  };
  /** The data, with this server's own id and name made on first use. */
  const data = () => {
    const d = read();
    if (!d.me?.id) {
      d.me = { id: crypto.randomBytes(8).toString("hex"), name: clip(os.hostname(), 60) || "This server" };
      write(d);
    }
    return d;
  };

  const me = () => data().me;
  function rename(name) {
    const d = data();
    d.me.name = clip(name, 60) || d.me.name;
    write(d);
    return d.me;
  }

  /** What the person sees: names, addresses and dates, never tokens. */
  const list = () => data().peers.map(({ id, name, url, created, seen }) => ({ id, name, url, created, seen: seen ?? 0 }));
  /** For calling a linked server (stays on this server). */
  const get = (id) => data().peers.find((p) => p.id === id) ?? null;
  const all = () => data().peers;

  /** A one-time code for another server to link with this one. */
  function invite() {
    const d = data();
    const code = `pdl_${crypto.randomBytes(16).toString("base64url")}`;
    d.invites = [...d.invites.filter((i) => i.expires > Date.now()), { hash: hash(code), expires: Date.now() + INVITE_MS }];
    write(d);
    return { code, expires: Date.now() + INVITE_MS };
  }

  /** Keep a link: `token` is what this server shows them; `theirHash` is the hash of what they show this server. */
  function keep({ id, name, url, token, theirHash }) {
    const d = data();
    if (!/^[a-f0-9]{16}$/.test(String(id))) throw Object.assign(new Error("That isn't a SEASIDE server."), { status: 400 });
    if (id === d.me.id) throw Object.assign(new Error("That's this server itself."), { status: 400 });
    const peer = { id, name: clip(name, 60) || "A server", url: cleanUrl(url), token: String(token), hash: theirHash, created: Date.now(), seen: Date.now() };
    if (!peer.url) throw Object.assign(new Error("That address doesn't look right."), { status: 400 });
    d.peers = [...d.peers.filter((p) => p.id !== id), peer];
    write(d);
    return peer;
  }

  /** The other side of linking: a server presents an invite code made here. Returns what it keeps of this server. */
  function accept(b, remoteAddress) {
    const d = data();
    const h = hash(b.code);
    const inv = d.invites.find((i) => i.expires > Date.now() && same(i.hash, h));
    if (!inv) throw Object.assign(new Error("That code isn't valid (they last 15 minutes and work once). Make a new one."), { status: 403 });
    d.invites = d.invites.filter((i) => i !== inv);
    write(d);
    if (!/^pdp_[A-Za-z0-9_-]{30,}$/.test(String(b.token))) throw Object.assign(new Error("No token came with the request."), { status: 400 });
    // where to reach them: the address they gave, or where the request came from, on the port they gave
    const host = String(remoteAddress || "").replace(/^::ffff:/, "");
    const url = cleanUrl(b.url) || (host ? cleanUrl(`http://${/^(127\.|::1$)/.test(host) ? "localhost" : host.includes(":") ? `[${host}]` : host}:${Number(b.port) || 15693}`) : "");
    const mine = newToken();
    keep({ id: b.id, name: b.name, url, token: b.token, theirHash: hash(mine) });
    return { id: d.me.id, name: d.me.name, token: mine };
  }

  /** The linked server this request's token belongs to, or null. */
  function check(req) {
    const m = /^Bearer\s+(pdp_[A-Za-z0-9_-]{30,})$/.exec(String(req.headers.authorization || ""));
    if (!m) return null;
    const h = hash(m[1]);
    return data().peers.find((p) => same(p.hash, h)) ?? null;
  }

  /** Noted when a linked server answers (at most once a minute, so the file isn't rewritten all the time). */
  function touch(id) {
    const d = data();
    const p = d.peers.find((x) => x.id === id);
    if (p && Date.now() - (p.seen ?? 0) > 60_000) {
      p.seen = Date.now();
      write(d);
    }
  }

  function remove(id) {
    const d = data();
    const before = d.peers.length;
    d.peers = d.peers.filter((p) => p.id !== String(id));
    write(d);
    return { removed: before - d.peers.length };
  }

  return { me, rename, list, get, all, invite, keep, accept, check, touch, remove, hash };
}
