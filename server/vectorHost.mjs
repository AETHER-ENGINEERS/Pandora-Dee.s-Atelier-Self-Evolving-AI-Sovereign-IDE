// Vector's own app inside the desktop: runs Vector built in PDA SEASIDE host mode (vector-host/build.mjs) with its
// window hidden, and relays between it and Vector's own interface, served here (/vector-app/) with a stand-in for
// the Tauri calls it makes (vector-host/shim.js).
//
// The hidden window's bridge page asks for work at /vh-bridge/next and answers at /vh-bridge/reply: from this
// computer only, with the token this run made. Everything else goes through /api/vector-host/ like the rest of
// the desktop's API.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

// handled in the page itself, never passed to the engine (updates come from rebuilding; windows are the desktop's)
const REFUSED = /^(plugin:(updater|process|window|webview|webview-window)\||download_and_install_update$|check_app_update$)/;

// a host the previous copy of this module started (before Vite restarted the server) has no one to talk to now
globalThis.__pddVectorHost?.kill();
if (!globalThis.__pddVectorHostExit) {
  globalThis.__pddVectorHostExit = true;
  process.once("exit", () => globalThis.__pddVectorHost?.kill());
}

export function createVectorHost(dataDir) {
  const home = () => path.join(dataDir(), "vector-host");
  const appDir = () => path.join(home(), "app");
  // PDD_VECTOR_HOST_EXE: a stand-in for testing (a .mjs runs with Node)
  const exe = () => process.env.PDD_VECTOR_HOST_EXE || path.join(appDir(), process.platform === "win32" ? "vector.exe" : "vector");
  let proc = null;
  let token = "";
  let lastPoll = 0;
  let nextId = 1;
  const queue = []; // for the bridge to take
  let waiting = null; // the bridge's open /next request
  const pending = new Map(); // id → { resolve, reject, timer }
  const subscribed = new Set();
  const clients = new Set(); // { res, events: Set }
  const log = [];

  function wake() {
    if (!waiting || !queue.length) return;
    const { res, timer } = waiting;
    waiting = null;
    clearTimeout(timer);
    res.end(JSON.stringify(queue.splice(0)));
  }
  function post(m) {
    queue.push(m);
    wake();
  }

  function build() {
    try {
      return JSON.parse(fs.readFileSync(path.join(appDir(), "build.json"), "utf8"));
    } catch {
      return null;
    }
  }

  function status() {
    return {
      built: fs.existsSync(exe()),
      build: build(),
      running: Boolean(proc),
      connected: Boolean(proc) && Date.now() - lastPoll < 35_000,
      log: log.slice(-20),
    };
  }

  /** Starts the host (once); `port` is this server's, for the bridge to reach. */
  function start(port) {
    if (proc) return status();
    if (!fs.existsSync(exe())) throw Object.assign(new Error("Vector's host build isn't here yet: build it with vector-host/build.mjs."), { status: 404 });
    token = crypto.randomBytes(24).toString("base64url");
    // a fresh run: forget whatever was waiting for the last one
    for (const [, p] of pending) p.reject(new Error("Vector restarted."));
    pending.clear();
    queue.length = 0;
    subscribed.clear();
    for (const c of clients) for (const e of c.events) subscribed.add(e);
    for (const e of subscribed) queue.push({ sub: e });
    fs.mkdirSync(path.join(home(), "data"), { recursive: true });
    const stand = exe().endsWith(".mjs");
    const child = spawn(stand ? process.execPath : exe(), stand ? [exe()] : [], {
      cwd: appDir(),
      env: { ...process.env, PDA_HOST_BRIDGE: `http://127.0.0.1:${port}/vh-bridge`, PDA_HOST_TOKEN: token, PDA_HOST_DATA: home() },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    proc = child;
    // remembered past a reload of this module (Vite restarts its server in the same process), and stopped with it
    globalThis.__pddVectorHost = child;
    const keep = (b) => {
      for (const line of String(b).split(/\r?\n/)) if (line.trim()) log.push(line.slice(0, 400));
      if (log.length > 200) log.splice(0, log.length - 200);
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    child.on("exit", (code) => {
      keep(`[host] Vector stopped (${code ?? "signal"}).`);
      if (proc === child) proc = null;
      for (const [, p] of pending) p.reject(new Error("Vector stopped."));
      pending.clear();
    });
    child.on("error", (e) => keep(`[host] ${e.message}`));
    return status();
  }

  function stop() {
    proc?.kill();
    proc = null;
    token = "";
    return status();
  }

  /** The bridge's two calls (only from this computer, only with this run's token). */
  function bridge(req, res, url, readBody) {
    const local = /^(127\.|::1$|::ffff:127\.)/.test(String(req.socket.remoteAddress || ""));
    res.setHeader("Access-Control-Allow-Origin", String(req.headers.origin || "*"));
    res.setHeader("Cache-Control", "no-store");
    if (!local || !token || url.searchParams.get("t") !== token) {
      res.statusCode = 403;
      return void res.end("[]");
    }
    lastPoll = Date.now();
    res.setHeader("Content-Type", "application/json");
    if (url.pathname.endsWith("/next")) {
      if (waiting) clearTimeout(waiting.timer), waiting.res.end("[]");
      waiting = { res, timer: setTimeout(() => ((waiting = null), res.end("[]")), 25_000) };
      req.on("close", () => {
        if (waiting?.res === res) clearTimeout(waiting.timer), (waiting = null);
      });
      return void wake();
    }
    return readBody(req, 300_000_000).then((body) => {
      for (const m of JSON.parse(body.toString("utf8") || "[]")) {
        if (m.event) {
          const line = `event: msg\ndata: ${JSON.stringify({ event: m.event, payload: m.payload })}\n\n`;
          for (const c of clients) if (c.events.has(m.event)) c.res.write(line);
        } else if (pending.has(m.id)) {
          const p = pending.get(m.id);
          pending.delete(m.id);
          clearTimeout(p.timer);
          if ("err" in m) p.reject(Object.assign(new Error(String(m.err)), { fromVector: true, value: m.err }));
          else p.resolve(m.ok);
        }
      }
      res.end("{}");
    });
  }

  function invoke(cmd, args) {
    if (REFUSED.test(cmd)) return Promise.reject(new Error(`${cmd} isn't available inside the desktop.`));
    if (!proc) return Promise.reject(Object.assign(new Error("Vector isn't running."), { status: 409 }));
    const id = nextId++;
    return new Promise((resolve, reject) => {
      // long ones (uploads, big syncs) get plenty of time
      const timer = setTimeout(() => (pending.delete(id), reject(new Error(`Vector didn't answer ${cmd}.`))), 15 * 60_000);
      pending.set(id, { resolve, reject, timer });
      post({ id, cmd, args });
    });
  }

  function emit(event, payload) {
    if (proc) post({ emit: String(event), payload });
  }

  /** Server-sent events for one page: the Vector events it listens to. */
  function events(req, res) {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    res.write(": hello\n\n");
    const c = { res, events: new Set() };
    clients.add(c);
    const ping = setInterval(() => res.write(": ping\n\n"), 20_000);
    req.on("close", () => (clearInterval(ping), clients.delete(c)));
    return c;
  }
  function subscribe(clientId, event) {
    const c = [...clients].find((x) => x.id === clientId);
    if (c) c.events.add(event);
    if (!subscribed.has(event)) {
      subscribed.add(event);
      if (proc) post({ sub: event });
    }
  }
  let clientSeq = 0;
  function connect(req, res) {
    const c = events(req, res);
    c.id = `c${++clientSeq}-${crypto.randomBytes(6).toString("hex")}`;
    res.write(`event: hello\ndata: ${JSON.stringify({ client: c.id })}\n\n`);
  }

  /** Only Vector's own folders: its accounts, received files and files picked in the page. */
  function assetPath(p) {
    const full = path.resolve(String(p || ""));
    const roots = ["data", "downloads", "uploads"].map((d) => path.join(home(), d));
    return roots.some((r) => full.startsWith(r + path.sep)) ? full : null;
  }

  /** A file picked in the page (the stand-in for Vector's file dialogs): kept where Vector can read it. */
  function upload(name, bytes) {
    const dir = path.join(home(), "uploads", crypto.randomBytes(8).toString("hex"));
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, path.basename(String(name || "file")).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_") || "file");
    fs.writeFileSync(file, bytes);
    return file;
  }
  function tidyUploads() {
    const dir = path.join(home(), "uploads");
    for (const d of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
      const full = path.join(dir, d);
      try {
        if (Date.now() - fs.statSync(full).mtimeMs > 3 * 86_400_000) fs.rmSync(full, { recursive: true, force: true });
      } catch {
        /* next time */
      }
    }
  }
  tidyUploads();

  /** Vector's interface, as built, with its root paths moved under /vector-app/ and the stand-in first. */
  function uiFile(rel) {
    const base = path.join(appDir(), "ui");
    const full = path.resolve(base, rel.replace(/^\/+/, "") || "index.html");
    if (!full.startsWith(base + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
    const ext = path.extname(full).slice(1).toLowerCase();
    if (!["html", "js", "css"].includes(ext)) return { file: full, ext };
    let text = fs.readFileSync(full, "utf8")
      .replace(/(["'`(])\/(js|icons|themes|twemoji|fonts|components)\//g, "$1/vector-app/$2/")
      .replace(/(["'`(])\/(main\.js|components\.bundle\.js|styles\.css|highlight-github-dark\.min\.css|overlay\.html)/g, "$1/vector-app/$2");
    if (ext === "html") text = text.replace(/<head>/i, '<head><script src="/vector-app/__pda/shim.js"></script>');
    return { text, ext };
  }

  return { status, start, stop, bridge, invoke, emit, connect, subscribe, assetPath, upload, uiFile };
}
