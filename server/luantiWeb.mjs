// Luanti in the browser: the real Luanti client built for WebAssembly (by this repository's "Luanti for the browser"
// workflow, from paradust7/luanti-wasm), fetched from this repository's releases, checked against its SHA-256, kept in
// the data folder, and served with the headers it needs (cross-origin isolation, for its threads). SEASIDE's own play
// page starts it with the desktop as its relay (luantiRelay.mjs) and the server, port and name already filled in.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { unzipSync } from "fflate";

export const REPO = "AETHER-ENGINEERS/Pandora-Dee.s-Atelier-Self-Evolving-AI-Sovereign-IDE";
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".wasm": "application/wasm", ".css": "text/css", ".json": "application/json", ".pack": "application/octet-stream", ".map": "application/json", ".txt": "text/plain; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".woff2": "font/woff2" };
const err = (message, status = 400) => Object.assign(new Error(message), { status });

/** The headers that make the page cross-origin isolated (its threads need SharedArrayBuffer). */
export function isolate(res) {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
}

/** SEASIDE's play page: the launcher from the build, the desktop as relay, everything else from the address bar. */
export function playPage(release) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Luanti · SEASIDE</title>
<style>
  html, body { margin: 0; height: 100%; background: #0b0912; color: #e6e1f0; font: 15px system-ui, sans-serif; }
  #seaside-status { position: fixed; inset: 0; display: grid; place-items: center; text-align: center; padding: 24px; z-index: 10; }
  #seaside-status b { color: #c4b5fd; }
  #seaside-bar { width: min(320px, 70vw); height: 6px; border-radius: 3px; background: #2a2340; margin: 12px auto 0; overflow: hidden; }
  #seaside-bar i { display: block; height: 100%; width: 0; background: #b9a4ff; transition: width .2s; }
  #seaside-log { max-width: 640px; white-space: pre-wrap; font: 12px ui-monospace, monospace; opacity: .6; margin-top: 14px; max-height: 30vh; overflow: auto; }
</style>
</head>
<body>
<div id="seaside-status"><div><b>Luanti</b> <span id="seaside-what">is getting ready…</span><div id="seaside-bar"><i></i></div><div id="seaside-log"></div></div></div>
<script src="${release}/launcher.js"></script>
<script>
  const what = document.getElementById("seaside-what");
  const bar = document.querySelector("#seaside-bar i");
  const log = document.getElementById("seaside-log");
  const say = (t) => (what.textContent = t);
  const note = (t) => (log.textContent += t + "\\n", log.scrollTop = log.scrollHeight);
  if (!self.crossOriginIsolated) {
    say("needs this page's secure address: open SEASIDE at its https address (Tailscale), or at localhost on the desktop's own computer.");
  } else {
    const args = LuantiArgs.fromQueryString(location.search);
    const relay = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/api/luanti/relay";
    const mtl = new LuantiLauncher();
    mtl.addPacks(args.packs);
    mtl.onprint = (t) => note(t);
    mtl.onprogress = (name, p) => (say((name.startsWith("install:") ? "is unpacking " : "is loading ") + name.replace(/^\\w+:/, "") + "…"), (bar.style.width = Math.round(p * 100) + "%"));
    mtl.onready = () => {
      document.getElementById("seaside-status").remove();
      mtl.setProxy(relay);
      const lang = (navigator.language || "en").split("-")[0];
      if (typeof SUPPORTED_LANGUAGES_MAP !== "undefined" && SUPPORTED_LANGUAGES_MAP.has(lang)) mtl.setLang(lang);
      // phones and tablets: a shorter view, so it stays smooth
      if (matchMedia("(pointer: coarse)").matches) (mtl.setConf("viewing_range", 85), mtl.setConf("max_block_send_distance", 5));
      mtl.launch(args);
    };
    mtl.onexit = () => (document.body.innerHTML = '<div id="seaside-status"><div><b>Luanti</b> has closed. Reload to play again.</div></div>');
    mtl.onerror = (e) => (say("stopped: " + e), note(String(e)));
  }
</script>
</body>
</html>`;
}

export function createLuantiWeb({ dataDir, fetchImpl = (...a) => fetch(...a) }) {
  const root = () => path.join(dataDir(), "luanti-web");
  const currentFile = () => path.join(root(), "current.json");
  const current = () => {
    try {
      const c = JSON.parse(fs.readFileSync(currentFile(), "utf8"));
      return c?.dir && fs.existsSync(path.join(root(), c.dir)) ? c : null;
    } catch {
      return null;
    }
  };
  /** The build's own folder (the one holding launcher.js), inside the installed copy. */
  const releaseDir = (dir) => fs.readdirSync(dir, { withFileTypes: true }).find((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, "launcher.js")))?.name ?? "";

  let busy = null; // { step, done, total }
  const status = () => ({ installed: current(), busy });

  /** The newest "Luanti for the browser" release of this repository. */
  async function latest() {
    const r = await fetchImpl(`https://api.github.com/repos/${REPO}/releases?per_page=30`, { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw err(`GitHub answered ${r.status}.`, 502);
    const rel = (await r.json()).filter((x) => /^luanti-web-/.test(x.tag_name) && !x.draft).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
    if (!rel) return null;
    const zip = rel.assets.find((a) => a.name === "luanti-web.zip");
    const sum = rel.assets.find((a) => a.name === "luanti-web.zip.sha256");
    return zip && sum ? { tag: rel.tag_name, made: rel.created_at, size: zip.size, zip: zip.browser_download_url, sum: sum.browser_download_url, digest: String(zip.digest || "").replace(/^sha256:/, "") } : null;
  }

  /** Fetch, check and unpack the newest build. Only one at a time. */
  async function install() {
    if (busy) throw err("It's already being fetched.", 409);
    busy = { step: "Looking for the newest build…", done: 0, total: 0 };
    try {
      const rel = await latest();
      if (!rel) throw err("There's no build yet: GitHub is still making it (it takes an hour or two the first time).", 404);
      const want = (await (await fetchImpl(rel.sum, { signal: AbortSignal.timeout(15_000) })).text()).trim().split(/\s+/)[0].toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(want) || (rel.digest && rel.digest !== want)) throw err("The build's checksum doesn't add up; it wasn't used.", 502);
      busy = { step: "Fetching Luanti…", done: 0, total: rel.size };
      const res = await fetchImpl(rel.zip, { signal: AbortSignal.timeout(15 * 60_000) });
      if (!res.ok || !res.body) throw err(`GitHub answered ${res.status}.`, 502);
      const parts = [];
      for await (const chunk of res.body) {
        parts.push(Buffer.from(chunk));
        busy.done += chunk.length;
      }
      const bytes = Buffer.concat(parts);
      const got = crypto.createHash("sha256").update(bytes).digest("hex");
      if (got !== want) throw err("What arrived doesn't match the build's checksum; it wasn't used. Try again.", 502);
      busy = { step: "Unpacking…", done: 0, total: 0 };
      const files = unzipSync(new Uint8Array(bytes));
      const dir = rel.tag.replace(/[^\w.-]/g, "_");
      const tmp = path.join(root(), `${dir}.tmp`);
      fs.rmSync(tmp, { recursive: true, force: true });
      for (const [name, data] of Object.entries(files)) {
        if (name.endsWith("/")) continue;
        const full = path.resolve(tmp, name);
        if (!full.startsWith(tmp + path.sep)) throw err("The build has a file in an odd place; it wasn't used.", 502);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, data);
      }
      const release = releaseDir(tmp);
      if (!release) throw err("The build is missing its launcher; it wasn't used.", 502);
      fs.rmSync(path.join(root(), dir), { recursive: true, force: true });
      fs.renameSync(tmp, path.join(root(), dir));
      const was = current();
      fs.writeFileSync(currentFile(), JSON.stringify({ dir, release, tag: rel.tag, made: rel.made, sha256: want, at: Date.now() }, null, 1));
      // the build it replaces goes
      if (was && was.dir !== dir) fs.rmSync(path.join(root(), was.dir), { recursive: true, force: true });
      return status();
    } finally {
      busy = null;
    }
  }

  /** /luanti-web/…: SEASIDE's play page, or the build's own files. */
  function serve(req, res, url, send) {
    const c = current();
    isolate(res);
    if (!c) return send(res, 404, "Luanti for the browser isn't set up on this desktop yet (Luanti window: Set up).", "text/plain; charset=utf-8");
    const rel = decodeURIComponent(url.pathname.slice("/luanti-web/".length));
    if (rel === "" || rel === "play" || rel === "play.html") {
      res.setHeader("Cache-Control", "no-cache");
      return send(res, 200, playPage(c.release), "text/html; charset=utf-8");
    }
    const base = path.join(root(), c.dir);
    const full = path.resolve(base, rel);
    if (!full.startsWith(base + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) return send(res, 404, "Not here.", "text/plain");
    const ext = path.extname(full).toLowerCase();
    res.statusCode = 200;
    res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream");
    res.setHeader("Content-Length", fs.statSync(full).size);
    // the build's own folder never changes (a new build gets a new one); the rest is checked each time
    res.setHeader("Cache-Control", rel.startsWith(`${c.release}/`) ? "public, max-age=31536000, immutable" : "no-cache");
    fs.createReadStream(full).pipe(res);
  }

  return { status, latest, install, serve };
}
