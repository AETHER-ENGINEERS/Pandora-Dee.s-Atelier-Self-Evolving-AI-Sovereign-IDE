// The desktop's local server, mounted into Vite (dev and preview).
//   http://localhost:PORT      the desktop, plus /api for the library and shared game state
//   http://127.0.0.1:PORT      apps and games, on their own origin so they can't read the desktop's keys

import fs from "node:fs";
import path from "node:path";
import { createLibrary } from "./xdc.mjs";
import { classicRelayScript, helperScript, webxdcScript } from "./inject.mjs";
import { sshOp } from "./ssh.mjs";
import { inbound } from "./inbound.mjs";
import { relay } from "./relay.mjs";
import { createMusic } from "./music.mjs";
import { createAvatars } from "./avatars.mjs";
import { createCreative } from "./creative.mjs";
import { checkUpdates, download } from "./upstreams.mjs";
import * as aicordAuth from "./oauth.mjs";
import { findCurl, findPython, forgetPrograms } from "./programs.mjs";

const MIME = {
  html: "text/html; charset=utf-8",
  apng: "image/apng",
  avif: "image/avif",
  mov: "video/quicktime",
  vrm: "model/gltf-binary",
  glb: "model/gltf-binary",
  moc3: "application/octet-stream",
  htm: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  wasm: "application/wasm",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  mp4: "video/mp4",
  webm: "video/webm",
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
  txt: "text/plain; charset=utf-8",
  md: "text/plain; charset=utf-8",
  toml: "text/plain; charset=utf-8",
  xml: "application/xml",
  data: "application/octet-stream",
};

// webxdc apps must not reach the network; this keeps them on their own files.
const XDC_CSP = [
  "default-src 'self' data: blob: 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'",
  "connect-src 'self' data: blob:",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "worker-src 'self' blob: data:",
].join("; ");

export function deskServer() {
  let root = process.cwd();
  let dataDir = "";
  let publicDir = "";
  let lib;
  let mus;
  const music = () => (mus ??= createMusic(dataDir));
  let crt;
  const creative = () => (crt ??= createCreative(() => dataDir));
  const library = () => {
    if (!lib) {
      lib = createLibrary(dataDir);
      const builtIn = path.join(publicDir || path.join(root, "public"), "apps", "jade-link.xdc");
      if (fs.existsSync(builtIn) && !lib.list().some((p) => p.appKey === "jade-link")) {
        try {
          lib.importAny(fs.readFileSync(builtIn), "jade-link.xdc");
        } catch {
          /* the library still works without it */
        }
      }
    }
    return lib;
  };
  const vaultDir = () => path.join(dataDir, "vault");
  /** A path inside the files folder, refusing anything that climbs out. */
  const vaultFile = (rel) => {
    const base = vaultDir();
    const full = path.resolve(base, String(rel || "").replace(/^\/+/, ""));
    return full === base || full.startsWith(base + path.sep) ? full : null;
  };

  const hostOf = (req) => String(req.headers.host || "").replace(/:\d+$/, "").toLowerCase();
  const isAppHost = (req) => hostOf(req) === "127.0.0.1";
  const isDeskHost = (req) => hostOf(req) === "localhost" || hostOf(req).endsWith(".localhost");
  const lan = () => process.env.PDD_LAN === "1";

  const send = (res, code, body, type = "application/json") => {
    res.statusCode = code;
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", "no-store");
    res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };

  const readBody = (req, limit = 1_200_000_000) =>
    new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on("data", (c) => {
        size += c.length;
        if (size > limit) {
          reject(new Error("too large"));
          req.destroy();
        } else chunks.push(c);
      });
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });

  function serveFile(res, file, inject) {
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, "Not found", "text/plain");
    const ext = path.extname(file).slice(1).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    let body = fs.readFileSync(file);
    if (inject && (ext === "html" || ext === "htm")) {
      const html = body.toString("utf8");
      const tag = `<script>${inject}</script>`;
      // only a <head> before any script is the real one (inlined libraries can contain "<head>" in their code);
      // otherwise the tag goes first, after a doctype if there is one so the page keeps its rendering mode
      const head = html.search(/<head[^>]*>/i);
      const script = html.search(/<script/i);
      const doctype = html.match(/^\s*<!doctype[^>]*>/i);
      body = Buffer.from(
        head >= 0 && (script < 0 || head < script)
          ? html.slice(0, head) + html.slice(head).replace(/<head[^>]*>/i, (m) => m + tag)
          : doctype ? doctype[0] + tag + html.slice(doctype[0].length) : tag + html,
        "utf8",
      );
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", "no-cache");
    res.end(body);
  }

  async function api(req, res, url) {
    const parts = url.pathname.split("/").filter(Boolean).slice(1); // after "api"
    const m = req.method;
    const L = library();
    if (parts[0] === "oauth" && parts[1] === "aicord") {
      if (parts[2] === "start" && m === "POST") {
        const b = JSON.parse((await readBody(req, 20_000)).toString("utf8") || "{}");
        try {
          return send(res, 200, aicordAuth.begin({ clientId: String(b.clientId || ""), redirectUri: String(b.redirectUri || ""), scopes: Array.isArray(b.scopes) ? b.scopes : [] }));
        } catch (e) {
          return send(res, 400, { error: e instanceof Error ? e.message : String(e) });
        }
      }
      if (parts[2] === "result") return send(res, 200, aicordAuth.result(url.searchParams.get("state")));
    }
    if (parts[0] === "relay" && parts[1] === "programs") {
      if (url.searchParams.get("refresh")) forgetPrograms();
      const py = findPython(url.searchParams.get("python") || "");
      const curl = findCurl();
      return send(res, 200, { python: py && { path: py.cmd + (py.args.length ? ` ${py.args.join(" ")}` : ""), version: py.version }, curl: curl && { path: curl.cmd, version: curl.version } });
    }
    // creative apps: GIMP, Krita, Inkscape, the Craft apps (install on request, open vault files in them)
    if (parts[0] === "create") {
      const C = creative();
      try {
        if (parts[1] === "apps" && m === "GET") return send(res, 200, C.list());
        if (m === "POST") {
          const b = JSON.parse((await readBody(req, 100_000)).toString("utf8") || "{}");
          if (parts[1] === "install") return send(res, 200, C.install(String(b.id)));
          if (parts[1] === "remove") return send(res, 200, (C.remove(String(b.id)), { ok: true }));
          if (parts[1] === "open") {
            const file = b.path ? vaultFile(String(b.path)) : "";
            if (b.path && (!file || !fs.existsSync(file))) return send(res, 400, { error: "That file isn't in the vault." });
            return send(res, 200, C.open(String(b.id), file || ""));
          }
        }
      } catch (e) {
        return send(res, 400, { error: e instanceof Error ? e.message : String(e) });
      }
    }
    if (parts[0] === "avatar") {
      const A = createAvatars(vaultDir);
      const charId = String(url.searchParams.get("char") || "");
      try {
        if (m === "POST") return send(res, 200, A.upload(charId, decodeURIComponent(String(req.headers["x-filename"] || "avatar")), await readBody(req, 300_000_000)));
        if (m === "DELETE") return send(res, 200, A.remove(charId, String(url.searchParams.get("entry") || "")));
      } catch (e) {
        return send(res, 400, { error: e instanceof Error ? e.message : String(e) });
      }
    }
    // Vault files by path (/api/vault/raw/a/b/model.model3.json), so a model's own relative paths work
    if (parts[0] === "vault" && parts[1] === "raw" && m === "GET") {
      const file = vaultFile(parts.slice(2).map(decodeURIComponent).join("/"));
      return serveFile(res, file);
    }
    if (parts[0] === "music") {
      const M = music();
      if (parts[1] === "library" && m === "GET") return send(res, 200, M.list());
      if (parts[1] === "scan" && m === "POST") {
        const b = JSON.parse((await readBody(req, 100_000)).toString("utf8") || "{}");
        return send(res, 200, await M.scan(Array.isArray(b.folders) ? b.folders.map(String) : M.folders()));
      }
      if (parts[1] === "file") return M.serve(req, res, String(url.searchParams.get("id") || ""));
      if (parts[1] === "cover") return void (await M.cover(res, String(url.searchParams.get("id") || "")));
      if (parts[1] === "radio") return void (await M.radio(req, res, String(url.searchParams.get("url") || "")));
      if (parts[1] === "upload" && m === "POST") {
        try {
          const name = M.upload(decodeURIComponent(String(req.headers["x-filename"] || "track")), await readBody(req, 500_000_000));
          return send(res, 200, { ok: true, name });
        } catch (e) {
          return send(res, 400, { error: e instanceof Error ? e.message : String(e) });
        }
      }
    }
    if (parts[0] === "relay" && m === "POST") return relay(req, res, JSON.parse((await readBody(req, 60_000_000)).toString("utf8") || "{}"));
    if (parts[0] === "info") return send(res, 200, { dataDir, xdcDir: L.root, fromEnv: Boolean(process.env.PDD_DATA) });
    if (parts[0] === "storage" && m === "POST") {
      // Move (or just point) the library to another folder, e.g. a roomier drive.
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const target = path.resolve(String(body.dataDir || ""));
      if (!body.dataDir || !path.isAbsolute(String(body.dataDir))) return send(res, 400, { error: "Give a full folder path, like F:\pandora-data." });
      if (target === dataDir) return send(res, 200, { dataDir });
      try {
        fs.mkdirSync(target, { recursive: true });
        if (body.move) {
          for (const sub of ["xdc", "xdc-state"]) {
            const from = path.join(dataDir, sub);
            if (fs.existsSync(from)) fs.cpSync(from, path.join(target, sub), { recursive: true, force: false, errorOnExist: false });
          }
        }
      } catch (e) {
        return send(res, 400, { error: `Couldn't use that folder: ${e instanceof Error ? e.message : e}` });
      }
      const old = dataDir;
      dataDir = target;
      lib = undefined;
      fs.writeFileSync(path.join(root, "pdd.config.json"), JSON.stringify({ dataDir }, null, 2));
      return send(res, 200, { dataDir, previous: old, moved: Boolean(body.move) });
    }
    if (parts[0] === "xdc") {
      const [, id, what] = parts;
      if (!id && m === "GET") return send(res, 200, L.list());
      // Newer releases where the apps are made (GitHub, Codeberg), checked only when asked
      if (id === "updates" && m === "POST") return send(res, 200, await checkUpdates(L.list()));
      if (id === "fetch-update" && m === "POST") {
        const b = JSON.parse((await readBody(req, 10_000)).toString("utf8") || "{}");
        try {
          const f = await download(String(b.url || ""));
          return send(res, 200, L.importAny(f.bytes, f.name));
        } catch (e) {
          return send(res, 400, { error: e instanceof Error ? e.message : String(e) });
        }
      }
      if (id === "import" && m === "POST") {
        const name = decodeURIComponent(String(req.headers["x-filename"] || "upload.xdc"));
        const bytes = await readBody(req);
        try {
          return send(res, 200, L.importAny(bytes, name));
        } catch (e) {
          return send(res, 400, { error: e.message });
        }
      }
      const pkg = L.get(id);
      if (!pkg) return send(res, 404, { error: "No such app version." });
      if (!what) {
        if (m === "PATCH") return send(res, 200, L.update(id, JSON.parse((await readBody(req)).toString("utf8") || "{}")));
        if (m === "DELETE") return send(res, 200, { ok: L.remove(id) });
        return send(res, 200, pkg);
      }
      if (what === "fork" && m === "POST") {
        const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
        return send(res, 200, L.fork(id, String(body.version || "")));
      }
      if (what === "export") {
        const zip = L.exportZip(id);
        res.setHeader("Content-Disposition", `attachment; filename="${(pkg.appKey || "app") + (pkg.version ? `-${pkg.version.replace(/[^\w.-]+/g, "_")}` : "")}.xdc"`);
        return send(res, 200, zip, "application/zip");
      }
      if (what === "icon") return pkg.icon ? serveFile(res, L.fileOf(id, pkg.icon)) : send(res, 404, "");
      if (what === "files") return send(res, 200, L.listFiles(id));
      if (what === "file") {
        const rel = url.searchParams.get("path") || "";
        const file = L.fileOf(id, rel);
        if (!file || !rel) return send(res, 400, { error: "Bad path." });
        if (m === "GET") return serveFile(res, file);
        if (m === "PUT") {
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, await readBody(req, 50_000_000));
          return send(res, 200, { ok: true });
        }
        if (m === "DELETE") {
          fs.rmSync(file, { force: true });
          return send(res, 200, { ok: true });
        }
      }
    }
    if (parts[0] === "ssh" && parts[1] && m === "POST") {
      const args = JSON.parse((await readBody(req, 2_000_000)).toString("utf8") || "{}");
      try {
        return send(res, 200, await sshOp(parts[1], args));
      } catch (e) {
        return send(res, 200, { error: e instanceof Error ? e.message : String(e) });
      }
    }
    if (parts[0] === "inbound") {
      if (parts[1] === "config" && m === "POST") return send(res, 200, await inbound.configure(JSON.parse((await readBody(req)).toString("utf8") || "{}")));
      if (parts[1] === "status") return send(res, 200, inbound.status());
      if (parts[1] === "next") return send(res, 200, (await inbound.next()) ?? { idle: true });
      if (parts[1] === "reply" && m === "POST") {
        const b = JSON.parse((await readBody(req, 5_000_000)).toString("utf8") || "{}");
        return send(res, 200, { ok: inbound.reply(String(b.id), Number(b.status) || 200, b.body ?? {}) });
      }
    }
    if (parts[0] === "vault") {
      const rel = url.searchParams.get("path") || "";
      if (parts[1] === "file") {
        const file = vaultFile(rel);
        if (!file || !rel) return send(res, 400, { error: "Bad path." });
        if (m === "GET") return serveFile(res, file);
        if (m === "PUT") {
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, await readBody(req, 200_000_000));
          return send(res, 200, { ok: true, path: rel });
        }
        if (m === "DELETE") {
          fs.rmSync(file, { force: true });
          return send(res, 200, { ok: true });
        }
      }
      // Notes: everything in the vault (but the desktop's own .pandora, the trash and tool folders).
      const skip = (name) => name === ".pandora" || name === ".trash" || name === "node_modules" || name === ".git";
      const walk = (dir, rel, out, depth = 0) => {
        if (depth > 24 || !fs.existsSync(dir)) return out;
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          if (skip(e.name)) continue;
          const r = rel ? `${rel}/${e.name}` : e.name;
          const full = path.join(dir, e.name);
          if (e.isDirectory()) {
            out.push({ path: r, dir: true, size: 0, mtime: 0 });
            walk(full, r, out, depth + 1);
          } else {
            const st = fs.statSync(full);
            out.push({ path: r, dir: false, size: st.size, mtime: st.mtimeMs });
          }
        }
        return out;
      };
      if (parts[1] === "tree") return send(res, 200, walk(vaultDir(), "", []));
      if (parts[1] === "notes") {
        const out = {};
        for (const f of walk(vaultDir(), "", [])) if (!f.dir && /\.(md|markdown)$/i.test(f.path) && f.size < 4_000_000) out[f.path] = fs.readFileSync(vaultFile(f.path), "utf8");
        return send(res, 200, out);
      }
      if (m === "POST" && (parts[1] === "move" || parts[1] === "mkdir" || parts[1] === "trash")) {
        const b = JSON.parse((await readBody(req, 100_000)).toString("utf8") || "{}");
        if (parts[1] === "mkdir") {
          const dir = vaultFile(b.path);
          if (!dir || !b.path) return send(res, 400, { error: "Bad path." });
          fs.mkdirSync(dir, { recursive: true });
          return send(res, 200, { ok: true });
        }
        const from = vaultFile(b.from);
        if (!from || !b.from || !fs.existsSync(from)) return send(res, 404, { error: "Nothing at that path." });
        // Deleting moves to .trash, so nothing a person or a character deletes is gone for good.
        const toRel = parts[1] === "trash" ? `.trash/${Date.now().toString(36)}-${String(b.from).replace(/[\\/]+/g, "~")}` : b.to;
        const to = vaultFile(toRel);
        if (!to || !toRel) return send(res, 400, { error: "Bad path." });
        if (fs.existsSync(to) && path.resolve(to).toLowerCase() !== path.resolve(from).toLowerCase()) return send(res, 409, { error: "Something already has that name." });
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.renameSync(from, to);
        return send(res, 200, { ok: true, path: toRel });
      }
      if (parts[1] === "rmdir" && m === "POST") {
        const b = JSON.parse((await readBody(req, 100_000)).toString("utf8") || "{}");
        const dir = vaultFile(b.path);
        if (!dir || !b.path || !fs.existsSync(dir)) return send(res, 404, { error: "No such folder." });
        if (fs.readdirSync(dir).length) return send(res, 409, { error: "That folder isn't empty." });
        fs.rmdirSync(dir);
        return send(res, 200, { ok: true });
      }
      if (parts[1] === "list") {
        const dir = vaultFile(rel || ".") ?? vaultDir();
        if (!fs.existsSync(dir)) return send(res, 200, []);
        return send(res, 200, fs.readdirSync(dir, { withFileTypes: true }).map((e) => ({ name: e.name, dir: e.isDirectory(), size: e.isFile() ? fs.statSync(path.join(dir, e.name)).size : 0 })));
      }
    }
    if (parts[0] === "state" && parts[1]) {
      const scope = parts[1];
      if (m === "GET") return send(res, 200, L.readUpdates(scope, Number(url.searchParams.get("since") || 0)));
      if (m === "POST") return send(res, 200, L.appendUpdate(scope, JSON.parse((await readBody(req, 2_000_000)).toString("utf8"))));
      if (m === "DELETE") {
        L.clearUpdates(scope);
        return send(res, 200, { ok: true });
      }
    }
    return send(res, 404, { error: "Unknown request." });
  }

  /** Apps and games, on the app origin only. */
  function run(req, res, url) {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "run") {
      const [, id, ...rest] = parts;
      const rel = decodeURIComponent(rest.join("/")) || "index.html";
      const L = library();
      const pkg = L.get(id);
      if (!pkg) return send(res, 404, "Not found", "text/plain");
      res.setHeader("Content-Security-Policy", XDC_CSP);
      if (rel === "webxdc.js") return send(res, 200, "/* webxdc is provided by Pandora Dee Desktop */", MIME.js);
      const q = url.searchParams;
      const inject = rel.endsWith(".html") || rel.endsWith(".htm")
        ? webxdcScript({ scope: q.get("scope") || pkg.appKey, addr: q.get("addr") || "you", name: q.get("name") || "You", lan: lan() })
        : "";
      return serveFile(res, L.fileOf(id, rel), inject);
    }
    if (parts[0] === "games") {
      const rel = decodeURIComponent(parts.join("/"));
      const file = path.resolve(publicDir, rel);
      if (!file.startsWith(path.join(publicDir, "games"))) return send(res, 403, "", "text/plain");
      return serveFile(res, file, /\.html?$/i.test(file) ? helperScript() : "");
    }
    return null;
  }

  /**
   * True when another website (or another local page) sent the request. Browsers mark every request
   * with where it came from; only the desktop's own page may use /api, so a site open in another tab
   * can't move files or start requests through it.
   */
  function fromElsewhere(req) {
    const site = String(req.headers["sec-fetch-site"] || "");
    if (site && site !== "same-origin" && site !== "none") return true;
    const origin = req.headers.origin;
    if (!origin) return false;
    try {
      return new URL(origin).host !== String(req.headers.host || "");
    } catch {
      return true;
    }
  }

  async function handle(req, res, next) {
    const url = new URL(req.url || "/", "http://x");
    try {
      if (url.pathname.startsWith("/api/")) {
        if (isAppHost(req) && !lan()) return send(res, 403, { error: "Not available to apps." });
        if (fromElsewhere(req)) return send(res, 403, { error: "Only the desktop's own page can use this." });
        return await api(req, res, url);
      }
      // AICord's sign-in sends the browser back here (a top-level visit from aicordapp.com, so not under /api;
      // it's only accepted with the state this desktop made)
      if (url.pathname === "/oauth/aicord/callback" && !isAppHost(req)) return send(res, 200, await aicordAuth.callback(url), "text/html; charset=utf-8");
      // Classic pages, with the relay hook added as they're served (the files themselves stay as built)
      if (/^\/classic\/[^/]+\.html$/.test(url.pathname) && !isAppHost(req)) {
        const file = path.resolve(publicDir, url.pathname.slice(1));
        if (file.startsWith(path.join(publicDir, "classic")) && fs.existsSync(file)) return serveFile(res, file, classicRelayScript());
      }
      if (url.pathname.startsWith("/run/") || (url.pathname.startsWith("/games/") && isAppHost(req))) {
        if (isDeskHost(req) && !lan()) return send(res, 403, "Apps run on their own address.", "text/plain");
        if (run(req, res, url) !== null) return;
      }
    } catch (e) {
      return send(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
    next();
  }

  return {
    name: "pandora-desk-server",
    configResolved(config) {
      root = config.root;
      let saved = "";
      try {
        saved = JSON.parse(fs.readFileSync(path.join(root, "pdd.config.json"), "utf8")).dataDir || "";
      } catch {
        saved = "";
      }
      dataDir = path.resolve(process.env.PDD_DATA || saved || path.join(root, "data"));
      publicDir = config.publicDir || path.join(root, "public");
    },
    configureServer(server) {
      server.middlewares.use(handle);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle);
    },
  };
}
