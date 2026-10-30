// Devices sharing their own files: a browser on a phone or another computer shares a folder (Chrome / Edge) or
// picked files, for as long as its page is open. The files stay on that device; this server only passes requests
// along: Explorer asks, the device's page answers (it waits for requests with a long poll, like Vector's bridge).
//
// Paths look like "device:<share id>/<path inside it>", so Explorer lists, previews and downloads them like any other.
// Shared files are read-only from elsewhere: the device keeps them; nothing is changed or deleted on it.

import crypto from "node:crypto";

const POLL_MS = 25_000; // how long a device's wait for a request lasts
const GONE_MS = 70_000; // a share whose page stopped asking is closed
const ANSWER_MS = 30_000; // how long Explorer waits for the device to answer a folder listing

export const isDevicePath = (p) => typeof p === "string" && p.startsWith("device:");

export function createDevShare() {
  /** id → { id, token, name, device, kind, seen, queue: [], wait: res|null } */
  const shares = new Map();
  /** request id → { resolve, reject, timer } for listings, or { res } for files */
  const pending = new Map();
  let seq = 0;

  const err = (status, message) => Object.assign(new Error(message), { status });
  const sweep = () => {
    for (const s of shares.values()) if (Date.now() - s.seen > GONE_MS) close(s.id, s.token);
  };

  function open({ name, device, kind }) {
    sweep();
    const id = crypto.randomBytes(6).toString("hex");
    const token = crypto.randomBytes(18).toString("hex");
    const clean = (t, n) => String(t || "").replace(/[\x00-\x1f]/g, "").trim().slice(0, n);
    shares.set(id, { id, token, name: clean(name, 80) || "Shared files", device: clean(device, 60) || "Another device", kind: kind === "folder" ? "folder" : "files", seen: Date.now(), queue: [], wait: null });
    return { id, token };
  }

  const own = (id, token) => {
    const s = shares.get(String(id));
    if (!s || s.token !== String(token)) throw err(404, "That share isn't open any more.");
    s.seen = Date.now();
    return s;
  };

  function close(id, token) {
    const s = shares.get(String(id));
    if (!s || s.token !== String(token)) return;
    shares.delete(s.id);
    if (s.wait) s.wait.writeHead(204).end();
    for (const r of s.queue) fail(r.rid, "The device stopped sharing.");
  }

  function fail(rid, message) {
    const p = pending.get(rid);
    if (!p) return;
    pending.delete(rid);
    clearTimeout(p.timer);
    if (p.reject) p.reject(err(410, message));
    else if (!p.res.headersSent) p.res.writeHead(410, { "Content-Type": "application/json" }).end(JSON.stringify({ error: message }));
  }

  function deliver(s) {
    if (!s.wait || !s.queue.length) return;
    const res = s.wait;
    s.wait = null;
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(s.queue.shift()));
  }

  /** The device's page waiting for the next request. */
  function next(id, token, res) {
    const s = own(id, token);
    if (s.wait) s.wait.writeHead(204).end();
    s.wait = res;
    const timer = setTimeout(() => {
      if (s.wait === res) (s.wait = null), res.writeHead(204).end();
    }, POLL_MS);
    res.on("close", () => {
      clearTimeout(timer);
      if (s.wait === res) s.wait = null;
    });
    deliver(s);
  }

  function ask(s, op, rel, extra) {
    const rid = `r${++seq}`;
    s.queue.push({ rid, op, path: rel });
    deliver(s);
    return { rid, ...extra };
  }

  /** "device:<id>/a/b" → the share and "a/b". */
  function split(p) {
    const m = /^device:([0-9a-f]+)(?:\/(.*))?$/.exec(String(p));
    const s = m && shares.get(m[1]);
    if (!s) throw err(404, "That device isn't sharing any more.");
    const rel = (m[2] || "").split("/").filter((x) => x && x !== "." && x !== "..").join("/");
    return { s, rel };
  }

  /** A folder on the device, listed by its page. */
  function list(p) {
    const { s, rel } = split(p);
    return new Promise((resolve, reject) => {
      const { rid } = ask(s, "list", rel);
      const timer = setTimeout(() => fail(rid, `${s.device} didn't answer. Is its page still open?`), ANSWER_MS);
      pending.set(rid, { resolve, reject, timer });
    }).then((r) => {
      const base = `device:${s.id}`;
      const up = rel.includes("/") ? `${base}/${rel.slice(0, rel.lastIndexOf("/"))}` : rel ? base : null;
      const entries = (Array.isArray(r.entries) ? r.entries : [])
        .filter((e) => e && typeof e.name === "string" && e.name && !/[\\/]/.test(e.name))
        .map((e) => ({
          name: e.name,
          path: `${base}/${rel ? `${rel}/` : ""}${e.name}`,
          dir: Boolean(e.dir),
          size: Number(e.size) || 0,
          mtime: Number(e.mtime) || 0,
          ext: e.dir ? "" : (e.name.includes(".") ? e.name.split(".").pop() : "").toLowerCase(),
        }))
        .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
      return { path: rel ? `${base}/${rel}` : base, parent: up, entries };
    });
  }

  /** A file on the device, streamed through as the page sends it. */
  function raw(p, res, download) {
    const { s, rel } = split(p);
    const { rid } = ask(s, "raw", rel);
    const timer = setTimeout(() => fail(rid, `${s.device} didn't send the file. Is its page still open?`), ANSWER_MS);
    pending.set(rid, { res, timer, download, name: rel.split("/").pop() || "file" });
    res.on("close", () => pending.delete(rid));
  }

  /** The device's page answering a request: JSON for a listing, the bytes for a file. */
  function reply(id, token, rid, req) {
    own(id, token);
    const p = pending.get(String(rid));
    if (!p) return req.resume(), false;
    pending.delete(String(rid));
    clearTimeout(p.timer);
    const problem = req.headers["x-error"] ? decodeURIComponent(String(req.headers["x-error"])) : "";
    if (p.res) {
      if (problem) return req.resume(), p.res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: problem })), true;
      const h = { "Content-Type": String(req.headers["content-type"] || "application/octet-stream"), "Cache-Control": "no-store" };
      if (req.headers["content-length"]) h["Content-Length"] = req.headers["content-length"];
      if (p.download) h["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(p.name)}`;
      p.res.writeHead(200, h);
      req.pipe(p.res);
      return new Promise((r) => req.on("end", () => r(true)));
    }
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (c) => (body.length < 5_000_000 ? (body += c) : null));
    return new Promise((r) =>
      req.on("end", () => {
        if (problem) p.reject(err(404, problem));
        else {
          try {
            p.resolve(JSON.parse(body || "{}"));
          } catch {
            p.reject(err(502, "The device's answer didn't make sense."));
          }
        }
        r(true);
      }),
    );
  }

  /** Who's sharing what right now, for Explorer's sidebar. */
  function places() {
    sweep();
    return [...shares.values()].map((s) => ({ id: `device-${s.id}`, name: `${s.name} (${s.device})`, path: `device:${s.id}`, kind: "device" }));
  }

  return { open, close, next, reply, list, raw, places, isDevicePath };
}
