// Vector for the people using the desktop: Vector's own vector-agent (an MCP server over stdio, built from
// Vector's repository) run for each signed-in account, its tools passed through to the desktop page. Each
// account's secret key (nsec) only lives in that agent's environment while it runs; Vector's own encrypted store
// for the account is in the data folder (vector/<account>). The characters' Vector accounts stay on the bridges.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

const win = process.platform === "win32";
const exe = win ? "vector-agent.exe" : "vector-agent";

/** Where vector-agent is: PDD_VECTOR_AGENT, the data folder, the usual build folder, or PATH. */
export function findAgent(dataDir) {
  const tries = [process.env.PDD_VECTOR_AGENT, path.join(dataDir, "vector", exe), win ? "F:\\pandora-work\\vector-build\\release\\vector-agent.exe" : "", path.join(process.cwd(), "..", "Vector", "crates", "target", "release", exe)].filter(Boolean);
  for (const t of tries) if (fs.existsSync(t)) return t;
  const r = spawnSync(win ? "where" : "which", ["vector-agent"], { encoding: "utf8", windowsHide: true });
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : "";
}

/** One running vector-agent: newline-delimited JSON-RPC (MCP) over its stdin/stdout. */
class Agent {
  constructor(bin, env, dir) {
    this.next = 1;
    this.waiting = new Map();
    this.log = [];
    // (a .mjs/.js agent runs through Node: used for a stand-in when testing)
    const [cmd, argv] = /\.(mjs|js)$/i.test(bin) ? [process.execPath, [bin]] : [bin, []];
    this.proc = spawn(cmd, argv, { env: { ...process.env, ...env, VECTOR_DATA_DIR: dir, RUST_LOG: "warn" }, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let buf = "";
    this.proc.stdout.on("data", (d) => {
      buf += d.toString("utf8");
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        const w = msg.id != null && this.waiting.get(msg.id);
        if (w) {
          this.waiting.delete(msg.id);
          clearTimeout(w.timer);
          msg.error ? w.no(new Error(msg.error.message || "Vector couldn't do that.")) : w.ok(msg.result);
        }
      }
    });
    this.proc.stderr.on("data", (d) => {
      for (const l of d.toString("utf8").split(/\r?\n/)) if (l.trim()) this.log.push(l.trim().replace(/nsec1[0-9a-z]+/gi, "nsec1…"));
      this.log = this.log.slice(-80);
    });
    this.exited = new Promise((ok) => this.proc.on("exit", (code) => {
      this.dead = true;
      for (const w of this.waiting.values()) w.no(new Error(`Vector stopped${this.log.length ? `: ${this.log.slice(-3).join(" ")}` : ""}.`));
      this.waiting.clear();
      ok(code);
    }));
  }

  request(method, params, timeoutMs = 120_000) {
    if (this.dead) return Promise.reject(new Error(`Vector isn't running${this.log.length ? `: ${this.log.slice(-3).join(" ")}` : ""}.`));
    const id = this.next++;
    return new Promise((ok, no) => {
      const timer = setTimeout(() => (this.waiting.delete(id), no(new Error("Vector took too long to answer."))), timeoutMs);
      this.waiting.set(id, { ok, no, timer });
      this.proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  notify(method, params) {
    if (!this.dead) this.proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, ...(params ? { params } : {}) })}\n`);
  }

  async start() {
    await this.request("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "pandora-dee-desktop", version: "1" } }, 90_000);
    this.notify("notifications/initialized");
  }

  /** Call a tool; its text answer, parsed as JSON when it is. */
  async call(name, args = {}, timeoutMs) {
    const r = await this.request("tools/call", { name, arguments: args }, timeoutMs);
    const text = (r?.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
    if (r?.isError) throw new Error(text || `Vector couldn't ${name.replace(/_/g, " ")}.`);
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  stop() {
    try {
      this.proc.kill();
    } catch {
      /* already gone */
    }
  }
}

export function createVector(dataDir) {
  const sessions = new Map(); // token → { agent, npub, account, at }
  const byAccount = new Map(); // account folder → agent (one per account, shared by its sessions)

  /** Sign in with a secret key (nsec); returns a session token for this browser and the account's npub. */
  async function start(nsec, password) {
    const key = String(nsec || "").trim();
    if (!/^nsec1[0-9a-z]{20,}$/.test(key)) throw new Error("That isn't a Vector secret key (it starts with nsec1).");
    const bin = findAgent(dataDir());
    if (!bin) throw new Error("vector-agent isn't built on this computer yet. Build it from Vector's repository (cargo build --release -p vector-agent) and put it in the data folder's vector folder.");
    // each account gets its own folder, named from a hash of its key (never the key itself)
    const account = crypto.createHash("sha256").update(key).digest("hex").slice(0, 16);
    let agent = byAccount.get(account);
    if (!agent || agent.dead) {
      const dir = path.join(dataDir(), "vector", account);
      fs.mkdirSync(dir, { recursive: true });
      agent = new Agent(bin, { VECTOR_NSEC: key, ...(password ? { VECTOR_PASSWORD: String(password) } : {}) }, dir);
      byAccount.set(account, agent);
      try {
        await agent.start();
      } catch (e) {
        agent.stop();
        byAccount.delete(account);
        throw e;
      }
    }
    const npub = String(await agent.call("my_npub")).trim().replace(/^"|"$/g, "");
    const token = crypto.randomBytes(24).toString("hex");
    sessions.set(token, { agent, npub, account, at: Date.now() });
    return { token, npub };
  }

  function session(token) {
    const s = sessions.get(String(token || ""));
    if (!s) throw Object.assign(new Error("Not signed in to Vector (or the desktop restarted): sign in again."), { status: 401 });
    if (s.agent.dead) {
      sessions.delete(token);
      throw Object.assign(new Error(`Vector stopped: ${s.agent.log.slice(-2).join(" ")} Sign in again.`), { status: 401 });
    }
    return s;
  }

  // the actions the Vector app uses (anything destructive or owner-only stays out)
  const ALLOWED = new Set(["my_npub", "list_chats", "get_messages", "get_new_messages", "send_dm", "send_file", "sync_dms", "get_profile", "load_profile", "update_profile", "set_nickname", "block_user", "unblock_user", "get_blocked_users", "list_communities", "join_community", "send_community_message", "sync_community_channel", "get_community_members", "list_pending_invites", "accept_pending_invite", "create_community", "create_public_invite", "leave_community"]);

  async function call(token, name, args) {
    if (!ALLOWED.has(name)) throw new Error(`The Vector app doesn't use “${name}”.`);
    const s = session(token);
    s.at = Date.now();
    return s.agent.call(name, args ?? {}, name.startsWith("sync") ? 300_000 : 120_000);
  }

  function stop(token) {
    const s = sessions.get(String(token || ""));
    sessions.delete(String(token || ""));
    if (s && ![...sessions.values()].some((x) => x.agent === s.agent)) {
      s.agent.stop();
      byAccount.delete(s.account);
    }
  }

  /** A file to send: saved where vector-agent can read it, then sent with send_file. */
  async function sendFile(token, to, name, bytes) {
    const s = session(token);
    // its own folder, so it goes out under its real name
    const dir = path.join(dataDir(), "vector", s.account, "outbox", `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, path.basename(String(name)).replace(/[\/:*?"<>|]+/g, "_") || "file");
    fs.writeFileSync(file, bytes);
    try {
      return await s.agent.call("send_file", { to_npub: to, file_path: file }, 300_000);
    } finally {
      setTimeout(() => fs.rm(dir, { recursive: true, force: true }, () => undefined), 60_000);
    }
  }

  /** An attachment's file: from where Vector saved it, or fetched and decrypted (AES-256-GCM, tag at the end). */
  async function attachment(token, a) {
    session(token);
    if (a.path && fs.existsSync(a.path) && a.downloaded) return fs.readFileSync(a.path);
    // https only: the sender chooses this address, and plain http could point it at machines inside the network
    // (PDD_VECTOR_ALLOW_HTTP=1 lifts that, for testing with a stand-in)
    const ok = /^https:\/\//i.test(String(a.url || "")) || (process.env.PDD_VECTOR_ALLOW_HTTP === "1" && /^http:\/\//i.test(String(a.url || "")));
    if (!ok) throw new Error("That attachment has no https address.");
    const r = await fetch(a.url, { signal: AbortSignal.timeout(120_000) });
    if (!r.ok) throw new Error(`The file's server answered ${r.status}.`);
    const data = Buffer.from(await r.arrayBuffer());
    if (!a.key || !a.nonce) return data; // not encrypted
    const key = Buffer.from(String(a.key), "hex");
    const iv = Buffer.from(String(a.nonce), "hex");
    const tag = data.subarray(data.length - 16);
    const d = crypto.createDecipheriv("aes-256-gcm", key, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]);
  }

  const status = () => ({ agent: Boolean(findAgent(dataDir())), sessions: sessions.size });

  return { start, call, stop, sendFile, attachment, status };
}
