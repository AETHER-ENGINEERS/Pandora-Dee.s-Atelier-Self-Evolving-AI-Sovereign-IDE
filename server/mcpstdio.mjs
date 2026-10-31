// Tool servers that talk over stdin/stdout (an mcp.json entry with "command"), run by the desktop and reached by
// its pages over HTTP: Classic can't start programs from a web page, so it needs supergateway; the desktop's own
// server can. Each one speaks newline-delimited JSON-RPC on its stdio; the page posts a request to
// /api/mcp-stdio/<id> and gets the matching answer back. Only servers the locksmith allowed are started (the page
// checks that before asking), and only from the desktop's own pages.

import { spawn } from "node:child_process";

const ID = /^[\w.-]{1,120}$/;

export function createMcpStdio() {
  const running = new Map(); // id -> { proc, waiting: Map<rpcId, resolve>, buf, log: string[], started, spec, exited }

  function stop(id) {
    const r = running.get(id);
    if (!r) return false;
    running.delete(id);
    for (const done of r.waiting.values()) done({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "The server was stopped." } });
    try {
      r.proc.kill();
    } catch {
      /* already gone */
    }
    return true;
  }

  function start({ id, command, args = [], env = {}, cwd }) {
    if (!ID.test(String(id))) throw new Error("Unknown server name.");
    if (!command || typeof command !== "string") throw new Error("The server has no command.");
    const spec = JSON.stringify({ command, args, env, cwd });
    const was = running.get(id);
    if (was && !was.exited && was.spec === spec) return status(id);
    stop(id);
    const proc = spawn(command, args.map(String), {
      cwd: cwd || undefined,
      env: { ...process.env, ...Object.fromEntries(Object.entries(env).map(([k, v]) => [k, String(v)])) },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      // .cmd / .bat (npx on Windows) only start through the shell
      shell: process.platform === "win32" && !/\.exe$/i.test(command) && !/^(node|python|python3|uv|uvx|deno|bun)$/i.test(command),
    });
    const r = { proc, waiting: new Map(), buf: "", log: [], started: Date.now(), spec, exited: null };
    const note = (line) => {
      r.log.push(line);
      if (r.log.length > 40) r.log.shift();
    };
    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (d) => {
      r.buf += d;
      let nl;
      while ((nl = r.buf.indexOf("\n")) >= 0) {
        const line = r.buf.slice(0, nl).trim();
        r.buf = r.buf.slice(nl + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          note(line.slice(0, 300)); // something printed that isn't a message
          continue;
        }
        const done = msg && msg.id != null && r.waiting.get(String(msg.id));
        if (done) (r.waiting.delete(String(msg.id)), done(msg));
      }
    });
    proc.stderr.setEncoding("utf8");
    proc.stderr.on("data", (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((l) => note(l.slice(0, 300))));
    proc.on("error", (e) => note(`couldn't start: ${e.message}`));
    proc.on("exit", (code, sig) => {
      r.exited = sig ? `stopped (${sig})` : `ended with code ${code}`;
      note(r.exited);
      for (const done of r.waiting.values()) done({ jsonrpc: "2.0", id: null, error: { code: -32000, message: `The server ${r.exited}.` } });
      r.waiting.clear();
    });
    running.set(id, r);
    return status(id);
  }

  function status(id) {
    const r = running.get(id);
    if (!r) return { id, running: false, log: [] };
    return { id, running: !r.exited, since: r.started, exited: r.exited, log: r.log.slice(-12) };
  }

  /** One JSON-RPC message from the page; answers come back for requests, notifications get nothing. */
  function send(id, msg, timeoutMs = 120_000) {
    const r = running.get(id);
    if (!r || r.exited) throw Object.assign(new Error(r?.exited ? `The server ${r.exited}. ${r.log.slice(-3).join(" ")}`.trim() : "The server isn't running."), { status: 404 });
    r.proc.stdin.write(JSON.stringify(msg) + "\n");
    if (msg.id == null) return Promise.resolve(null);
    return new Promise((resolve) => {
      const key = String(msg.id);
      const timer = setTimeout(() => {
        r.waiting.delete(key);
        resolve({ jsonrpc: "2.0", id: msg.id, error: { code: -32001, message: `No answer within ${Math.round(timeoutMs / 1000)}s.` } });
      }, timeoutMs);
      r.waiting.set(key, (m) => (clearTimeout(timer), resolve({ ...m, id: msg.id })));
    });
  }

  return {
    start,
    stop,
    status,
    list: () => [...running.keys()].map(status),
    send,
    closeAll: () => [...running.keys()].forEach(stop),
  };
}
