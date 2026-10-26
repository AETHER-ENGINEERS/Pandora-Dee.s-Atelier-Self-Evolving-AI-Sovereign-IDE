// Interactive SSH sessions, opened by the desktop server for the characters (and for you).
// A host's key is approved the first time; a different key is refused after that.

import crypto from "node:crypto";
import { Client } from "ssh2";

const sessions = new Map();
let seq = 0;

const KEYS = {
  enter: "\r",
  tab: "\t",
  esc: "\x1b",
  backspace: "\x7f",
  up: "\x1b[A",
  down: "\x1b[B",
  right: "\x1b[C",
  left: "\x1b[D",
  "ctrl-c": "\x03",
  "ctrl-d": "\x04",
  "ctrl-z": "\x1a",
  "ctrl-l": "\x0c",
  "ctrl-a": "\x01",
  "ctrl-e": "\x05",
  "ctrl-u": "\x15",
  "ctrl-r": "\x12",
};

/** Terminal colour codes and cursor moves removed, for reading. */
export function plain(text) {
  return text
    .replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b[()][0-9A-Za-z]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
}

const fingerprintOf = (key) => `SHA256:${crypto.createHash("sha256").update(key).digest("base64").replace(/=+$/, "")}`;

function connect({ host, port, user, password, key, fingerprint }) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let seen = null;
    let refused = null;
    conn.on("ready", () => resolve({ conn, fingerprint: seen }));
    conn.on("error", (e) => reject(refused ?? e));
    conn.connect({
      host,
      port: Number(port) || 22,
      username: user,
      password: password || undefined,
      privateKey: key || undefined,
      readyTimeout: 20000,
      keepaliveInterval: 15000,
      hostVerifier: (hostKey) => {
        seen = fingerprintOf(hostKey);
        if (!fingerprint) {
          refused = Object.assign(new Error("needs trust"), { needsTrust: true, fingerprint: seen });
          return false;
        }
        if (fingerprint !== seen) {
          refused = Object.assign(new Error(`The host key of ${host} changed (expected ${fingerprint}, got ${seen}). Nothing was connected. If the machine was reinstalled, forget its key in Connections → SSH and approve the new one.`), { changed: true });
          return false;
        }
        return true;
      },
    });
  });
}

async function open(a) {
  let c;
  try {
    c = await connect(a);
  } catch (e) {
    if (e.needsTrust) return { needs_trust: true, fingerprint: e.fingerprint };
    if (e.changed) return { error: e.message, host_key_changed: true };
    return { error: `Couldn't connect to ${a.host}: ${e.message}` };
  }
  const stream = await new Promise((resolve, reject) => c.conn.shell({ term: "xterm-256color", cols: a.cols || 120, rows: a.rows || 36 }, (err, s) => (err ? reject(err) : resolve(s))));
  const id = `s${++seq}`;
  const s = { id, label: a.label || a.host, host: a.host, user: a.user, conn: c.conn, stream, buf: "", unread: "", opened: Date.now(), alive: true, last: Date.now() };
  const take = (d) => {
    const t = d.toString("utf8");
    s.buf = (s.buf + t).slice(-400_000);
    s.unread = (s.unread + t).slice(-200_000);
    s.last = Date.now();
  };
  stream.on("data", take);
  stream.stderr?.on("data", take);
  stream.on("close", () => {
    s.alive = false;
    c.conn.end();
  });
  c.conn.on("close", () => (s.alive = false));
  sessions.set(id, s);
  await new Promise((r) => setTimeout(r, 900));
  const output = plain(s.unread);
  s.unread = "";
  return { session: id, host: a.host, user: a.user, output: output.slice(-4000) };
}

function find(id) {
  const s = sessions.get(String(id || ""));
  if (!s) throw new Error(`No open session called ${id}. Use list to see them.`);
  return s;
}

async function read(a) {
  const s = find(a.session);
  const wait = Math.min(20000, Math.max(0, Number(a.wait_ms ?? 1500)));
  const quiet = Math.min(5000, Math.max(100, Number(a.quiet_ms ?? 500)));
  const until = a.until ? String(a.until) : "";
  const start = Date.now();
  for (;;) {
    const text = plain(s.unread);
    if (until && text.includes(until)) break;
    if (Date.now() - start >= wait) break;
    if (!until && s.unread && Date.now() - s.last >= quiet && Date.now() - start >= 200) break;
    if (!s.alive) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const max = Math.min(20000, Math.max(200, Number(a.max_chars) || 6000));
  let out = plain(s.unread);
  s.unread = "";
  if (out.length > max) out = `[${out.length - max} earlier characters skipped]\n${out.slice(-max)}`;
  return { session: s.id, output: out, alive: s.alive };
}

function send(a) {
  const s = find(a.session);
  if (!s.alive) throw new Error("That session has closed.");
  let text = a.text != null ? String(a.text) : "";
  for (const k of a.keys || []) text += KEYS[String(k).toLowerCase()] ?? "";
  if (a.enter !== false && a.text != null && !(a.keys || []).length) text += "\r";
  s.stream.write(text);
  return { ok: true };
}

function exec(a) {
  const s = find(a.session);
  const ms = Math.min(600_000, Math.max(1000, Number(a.timeout_ms) || 60_000));
  return new Promise((resolve) => {
    s.conn.exec(String(a.command), (err, stream) => {
      if (err) return resolve({ error: err.message });
      let out = "";
      let errOut = "";
      const t = setTimeout(() => {
        stream.close();
        resolve({ code: null, stdout: plain(out).slice(-20000), stderr: plain(errOut).slice(-8000), timed_out: true });
      }, ms);
      stream.on("data", (d) => (out += d));
      stream.stderr.on("data", (d) => (errOut += d));
      stream.on("close", (code) => {
        clearTimeout(t);
        resolve({ code, stdout: plain(out).slice(-20000), stderr: plain(errOut).slice(-8000) });
      });
    });
  });
}

function sftp(s) {
  return new Promise((resolve, reject) => s.conn.sftp((err, x) => (err ? reject(err) : resolve(x))));
}

async function get(a) {
  const s = find(a.session);
  const x = await sftp(s);
  const data = await new Promise((resolve, reject) => x.readFile(String(a.path), (err, b) => (err ? reject(err) : resolve(b))));
  const max = Math.min(200_000, Number(a.max_chars) || 20000);
  const text = data.toString("utf8");
  return { path: a.path, bytes: data.length, text: text.length > max ? `${text.slice(0, max)}\n[cut: ${text.length - max} more characters]` : text };
}

async function put(a) {
  const s = find(a.session);
  const x = await sftp(s);
  await new Promise((resolve, reject) => x.writeFile(String(a.path), Buffer.from(String(a.text ?? ""), "utf8"), (err) => (err ? reject(err) : resolve())));
  return { ok: true, path: a.path };
}

function list() {
  return { sessions: [...sessions.values()].map((s) => ({ session: s.id, label: s.label, host: s.host, user: s.user, alive: s.alive, opened: s.opened })) };
}

function close(a) {
  const s = sessions.get(String(a.session || ""));
  if (s) {
    try {
      s.stream.end();
      s.conn.end();
    } catch {
      /* already gone */
    }
    sessions.delete(s.id);
  }
  return { ok: true };
}

/** The whole recent transcript, for the SSH window (doesn't consume what the characters will read). */
function screen(a) {
  const s = find(a.session);
  return { session: s.id, text: plain(s.buf).slice(-60000), alive: s.alive };
}

export async function sshOp(op, a) {
  switch (op) {
    case "open":
      return open(a);
    case "read":
      return read(a);
    case "send":
      return send(a);
    case "exec":
      return exec(a);
    case "get":
      return get(a);
    case "put":
      return put(a);
    case "list":
      return list();
    case "close":
      return close(a);
    case "close_all":
      for (const id of [...sessions.keys()]) close({ session: id });
      return { ok: true };
    case "resize": {
      const s = find(a.session);
      s.stream.setWindow(Number(a.rows) || 36, Number(a.cols) || 120, 0, 0);
      return { ok: true };
    }
    case "screen":
      return screen(a);
    default:
      throw new Error(`Unknown SSH action "${op}".`);
  }
}
