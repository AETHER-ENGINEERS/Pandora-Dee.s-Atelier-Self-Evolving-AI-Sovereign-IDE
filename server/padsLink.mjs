// PADS across linked servers (see peers.mjs): the account's devices on every linked server in one roster, and
// "Send to" reaching a device (or the vault) on another server. Pictures travel with what's sent, and land in the
// receiving server's vault (Pictures › From <server>), so its devices open them from their own server.

import fs from "node:fs";
import path from "node:path";
import { cleanItem } from "./pads.mjs";
import { newToken, cleanUrl } from "./peers.mjs";

const TIMEOUT_MS = 4000;
const CACHE_MS = 4000;
const PICTURE_MAX = 20_000_000;
const ID = /^[A-Za-z0-9_-]{8,40}$/;
const clip = (s, n) => String(s ?? "").slice(0, n);
const num = (v, lo, hi, d = 0) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
const err = (message, status = 400) => Object.assign(new Error(message), { status });
const stamp = () => new Date().toISOString().slice(0, 19).replace("T", " ").replace(/:/g, "-");
const safeName = (s) => clip(String(s ?? "").replace(/[\\/:*?"<>|[\]#^]+/g, " ").replace(/\s+/g, " ").trim(), 80);

export function createPadsLink({ pads, peers, vaultFile, fetchImpl = (...a) => fetch(...a) }) {
  /** Ask a linked server something, with this server's token for it. */
  async function call(peer, route, body) {
    const r = await fetchImpl(`${peer.url}${route}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${peer.token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "error",
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) throw err(`${peer.name} no longer knows this server (it was unlinked there). Link them again.`, 502);
    if (!r.ok) throw err(j.error || `${peer.name} answered ${r.status}.`, 502);
    peers.touch(peer.id);
    return j;
  }

  // each linked server's devices for an account, fetched at most every few seconds
  const cache = new Map(); // `${peer}|${account}` → { at, ok, error, devices, pending }
  function peerDevices(peer, account, wait) {
    const key = `${peer.id}|${account.toLowerCase()}`;
    const c = cache.get(key) ?? { at: 0, ok: false, error: "", devices: [] };
    if (Date.now() - c.at < CACHE_MS) return c;
    if (!c.pending) {
      c.pending = call(peer, `/pads-peer/roster?account=${encodeURIComponent(account)}`)
        .then(
          (j) => ({ at: Date.now(), ok: true, error: "", devices: Array.isArray(j.devices) ? j.devices.slice(0, 60) : [] }),
          (e) => ({ at: Date.now(), ok: false, error: e instanceof Error ? e.message : String(e), devices: [] }),
        )
        .then((v) => (cache.set(key, v), v));
      cache.set(key, c);
    }
    return wait ? c.pending : c;
  }

  /** A device as a linked server reported it, kept to the fields the Manager shows. */
  const tidy = (d) => ({
    id: d.id,
    name: clip(d.name, 60) || "A device",
    kind: clip(d.kind, 20) || "other",
    screen: { w: num(d.screen?.w, 200, 10000, 1280), h: num(d.screen?.h, 200, 10000, 800), dpr: num(d.screen?.dpr, 0.5, 5, 1) },
    browser: clip(d.browser, 40),
    seen: num(d.seen, 0, 1e15),
    here: Boolean(d.here),
    state: d.state && typeof d.state === "object" ? d.state : null,
    layout: { x: num(d.layout?.x, -20000, 20000), y: num(d.layout?.y, -20000, 20000) },
  });

  /** Every device of the account, on this server and the linked ones; and how each linked server is doing.
   *  wait: false answers at once from what's known (and asks the others in the background). */
  async function roster(account, { wait = true } = {}) {
    const me = peers.me();
    const devices = pads.roster(account).devices.map((d) => ({ ...d, server: me.name, serverId: me.id }));
    const seen = new Set(devices.map((d) => d.id));
    const servers = [{ id: me.id, name: me.name, here: true, me: true }];
    const results = await Promise.all(peers.all().map(async (p) => [p, await peerDevices(p, account, wait)]));
    for (const [p, r] of results) {
      servers.push({ id: p.id, name: p.name, url: p.url, here: r.ok, error: r.error });
      for (const raw of r.devices) {
        if (!raw || !ID.test(String(raw.id)) || seen.has(raw.id)) continue;
        seen.add(raw.id);
        const d = tidy(raw);
        // placed where this room put it, or (until it's moved here) a row below this server's own devices
        devices.push({ ...d, layout: pads.layoutOf(account, d.id) ?? { x: d.layout.x, y: d.layout.y + 420 }, server: p.name, serverId: p.id });
      }
    }
    return { devices, servers };
  }

  /** A picture from this vault, to travel with what's sent. */
  function pictureOf(item) {
    if (item.kind !== "image") return undefined;
    const f = vaultFile(item.path);
    if (!f || !fs.existsSync(f)) throw err("That picture isn't in the vault any more.", 404);
    if (fs.statSync(f).size > PICTURE_MAX) throw err("That picture is too big to send (20 MB at most).");
    return { name: path.basename(f), data: fs.readFileSync(f).toString("base64") };
  }

  /** Save a picture that came from a linked server into this vault (Pictures › From <server>). */
  function savePicture(picture, fromServer) {
    const name = safeName(path.basename(String(picture?.name || "Picture.png"))) || "Picture.png";
    if (!/\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(name)) throw err("Only pictures travel this way.");
    const bytes = Buffer.from(String(picture?.data || ""), "base64");
    if (!bytes.length || bytes.length > PICTURE_MAX) throw err("The picture didn't arrive whole.");
    const dir = `Pictures/From ${safeName(fromServer) || "another server"}`;
    const ext = path.extname(name);
    let rel = `${dir}/${name}`;
    for (let i = 2; fs.existsSync(vaultFile(rel)); i++) rel = `${dir}/${name.slice(0, -ext.length)} ${i}${ext}`;
    const f = vaultFile(rel);
    if (!f) throw err("That picture can't be saved there.");
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, bytes);
    return rel;
  }

  /** "Send to → <server>": text and links become a note in that server's vault (Sent here); pictures are kept. */
  function keepHere(item, from) {
    if (item.kind === "image") return { ok: true, path: item.path };
    const title = safeName(item.title || (item.kind === "text" ? item.text.split("\n").find((l) => l.trim()) : item.url.replace(/^https?:\/\//, ""))) || "Sent here";
    const rel = `Sent here/${title.slice(0, 60)} ${stamp()}.md`;
    const f = vaultFile(rel);
    if (!f) throw err("That note can't be saved there.");
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const body = item.kind === "text" ? item.text : `[${item.title || item.url}](${item.url})`;
    fs.writeFileSync(f, `${body}\n\n_Sent from ${from}, ${new Date().toLocaleString()}_\n`);
    return { ok: true, path: rel };
  }

  /** "Send to" from a device on this server: to one of this server's devices, a device on a linked server, or a
   *  server itself ("server:<id>"). */
  async function send(account, b) {
    const me = peers.me();
    const to = String(b.to || "");
    const fromId = String(b.from || "");
    const from = pads.roster(account).devices.find((d) => d.id === fromId);
    if (!from) throw err("That device isn't in this account's PADS.", 404);
    if (!to.startsWith("server:") && pads.has(account, to)) return pads.sendTo(account, b);
    const item = cleanItem(b.item);
    const sender = { id: from.id, name: from.name };
    if (to.startsWith("server:")) {
      const sid = to.slice(7);
      if (sid === me.id) return keepHere(item, from.name);
      const p = peers.get(sid);
      if (!p) throw err("That server isn't linked with this one.", 404);
      return call(p, "/pads-peer/send", { account, keep: true, from: sender, item, picture: pictureOf(item) });
    }
    // which linked server has that device (asking them again if it isn't known yet)
    let owner = peers.all().find((p) => cache.get(`${p.id}|${account.toLowerCase()}`)?.devices?.some((d) => d?.id === to));
    if (!owner) {
      await roster(account, { wait: true });
      owner = peers.all().find((p) => cache.get(`${p.id}|${account.toLowerCase()}`)?.devices?.some((d) => d?.id === to));
    }
    if (!owner) throw err("That device isn't in this account's PADS.", 404);
    return call(owner, "/pads-peer/send", { account, to, from: sender, item, picture: pictureOf(item) });
  }

  /** Linking, from this server's side: given the other's address and an invite code it made. */
  async function link(address, code, { port, url }) {
    const target = cleanUrl(address);
    if (!target) throw err("That address doesn't look right. It's like http://192.168.1.20:15693");
    const me = peers.me();
    const forThem = newToken(); // what they'll show this server
    const r = await fetchImpl(`${target}/pads-peer/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: String(code || "").trim(), id: me.id, name: me.name, port, url, token: forThem }),
      signal: AbortSignal.timeout(8000),
      redirect: "error",
    }).catch((e) => {
      throw err(`Couldn't reach ${target}: ${e instanceof Error ? e.message : String(e)}. Is SEASIDE running there, and shared on the network?`, 502);
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw err(j.error || `${target} answered ${r.status}.`, 502);
    // the token sent along was the one they'll use; this side keeps only its hash
    const peer = peers.keep({ id: j.id, name: j.name, url: target, token: j.token, theirHash: peers.hash(forThem) });
    return { id: peer.id, name: peer.name, url: peer.url };
  }

  /** Requests from linked servers (not under /api: they aren't the desktop's own page). True when handled. */
  async function handle(req, res, url, { readBody, send: reply }) {
    if (!url.pathname.startsWith("/pads-peer/")) return false;
    const route = url.pathname.slice("/pads-peer/".length);
    try {
      if (route === "join" && req.method === "POST") {
        const b = JSON.parse((await readBody(req, 20_000)).toString("utf8") || "{}");
        return reply(res, 200, peers.accept(b, req.socket.remoteAddress)), true;
      }
      const peer = peers.check(req);
      if (!peer) return reply(res, 401, { error: "This server isn't linked here." }), true;
      peers.touch(peer.id);
      const account = String(url.searchParams.get("account") || "");
      if (route === "roster" && req.method === "GET") return reply(res, 200, { devices: pads.roster(account).devices }), true;
      if (route === "send" && req.method === "POST") {
        const b = JSON.parse((await readBody(req, 30_000_000)).toString("utf8") || "{}");
        const acct = String(b.account || "");
        let item = b.item?.kind === "image" ? { ...b.item, path: "pending.png" } : b.item;
        item = cleanItem(item);
        if (item.kind === "image") item.path = savePicture(b.picture, peer.name);
        const who = `${clip(b.from?.name, 60) || "A device"} (${peer.name})`;
        if (b.keep) return reply(res, 200, keepHere(item, who)), true;
        return reply(res, 200, pads.deliver(acct, String(b.to || ""), { from: who, fromId: clip(b.from?.id, 40), item })), true;
      }
      return reply(res, 404, { error: "Not something linked servers ask for." }), true;
    } catch (e) {
      return reply(res, e?.status ?? 400, { error: e instanceof Error ? e.message : String(e) }), true;
    }
  }

  return { roster, send, link, handle, keepHere };
}
