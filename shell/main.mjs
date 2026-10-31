// PDA SEASIDE as an app on the computer: the same desktop in its own window, and a Browser window that holds real
// browser tabs (Chromium's own web views, placed where the Browser window is), not pictures of a page. Pages get
// the real GPU, real sound and video, real scrolling, selection and right-click.
//
// The desktop itself is the usual one: if it's already running on this computer (Start Pandora Dee, port 15693)
// the app opens that; otherwise it starts the same server inside the app. SEASIDE_URL points it at another
// desktop (a test copy, for instance).
//
// Browser pages run in their own sandboxed session ("persist:seaside-browser"), separate from the desktop, with
// no access to the app; they can't reach the desktop's server or anything else on this computer.

import { app, BrowserWindow, WebContentsView, ipcMain, session, shell, Menu } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
// the desktop's usual port (SEASIDE_PORT for another; PDD_DATA chooses the data folder, as with npm run dev)
const PORT = Number(process.env.SEASIDE_PORT) || 15693;

app.setName("PDA SEASIDE");
if (!app.requestSingleInstanceLock()) app.quit();

/** The desktop's address: given, already running, or started here. */
async function desktopUrl() {
  if (process.env.SEASIDE_URL) return process.env.SEASIDE_URL.replace(/\/$/, "");
  const url = `http://localhost:${PORT}`;
  try {
    const r = await fetch(`${url}/api/info`, { signal: AbortSignal.timeout(1500) });
    if (r.ok) return url;
  } catch {
    /* not running: start it */
  }
  const { createServer } = await import("vite");
  const server = await createServer({ root, configFile: path.join(root, "vite.config.ts"), server: { port: PORT, strictPort: true } });
  await server.listen();
  app.once("will-quit", () => void server.close());
  return url;
}

let win = null;
let base = "";

async function openWindow() {
  base = await desktopUrl();
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: "PDA SEASIDE",
    icon: path.join(root, "icon.png"),
    backgroundColor: "#0b0912",
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(here, "preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  Menu.setApplicationMenu(null);
  win.maximize();
  // links the desktop opens in a new window go to the person's own browser, except the desktop's own pages
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(base)) return { action: "allow" };
    void shell.openExternal(url);
    return { action: "deny" };
  });
  win.on("closed", () => {
    win = null;
    tabs.clear();
  });
  win.on("resize", () => sendTabs());
  await win.loadURL(base);
}

// ---------- the real browser ----------

/** Pages must never reach this computer itself or the desktop wherever it answers (same rule as the streamed engine). */
function forbidden(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (!/^(https?|wss?):$/.test(u.protocol)) return false;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h === "::1" || h === "0.0.0.0" || /^127\./.test(h)) return true;
  const port = Number(u.port || (u.protocol === "https:" || u.protocol === "wss:" ? 443 : 80));
  const deskPort = Number(new URL(base).port || 80);
  return port === deskPort && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.)/.test(h);
}

/** Address bar text: an address as is, a name with a dot as https, anything else a search. */
function addressOf(text) {
  const s = String(text || "").trim();
  if (!s) return "about:blank";
  if (/^(https?:|about:)/i.test(s)) return s;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(s)) return `https://${s}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(s)}`;
}

let pages = null; // the browser's session
async function browserSession() {
  if (pages) return pages;
  pages = session.fromPartition("persist:seaside-browser");
  // sites see the Chromium this is, the way Chrome itself reports it (major version only, nothing about the app)
  const platform = /\(([^)]+)\)/.exec(pages.getUserAgent())?.[1] ?? "Windows NT 10.0; Win64; x64";
  const major = process.versions.chrome.split(".")[0];
  pages.setUserAgent(`Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`);
  pages.webRequest.onBeforeRequest((d, cb) => cb({ cancel: forbidden(d.url) }));
  // nothing is granted silently: camera, microphone, location, notifications and the rest are refused for now
  pages.setPermissionRequestHandler((_wc, perm, cb) => cb(["fullscreen", "clipboard-sanitized-write"].includes(perm)));
  pages.setPermissionCheckHandler((_wc, perm) => ["fullscreen", "clipboard-sanitized-write"].includes(perm));
  // downloads go to the vault's Downloads folder, as with the streamed browser
  let downloads = "";
  try {
    const info = await (await fetch(`${base}/api/info`)).json();
    downloads = path.join(info.dataDir, "vault", "Downloads");
  } catch {
    downloads = app.getPath("downloads");
  }
  pages.on("will-download", (_e, item) => {
    fs.mkdirSync(downloads, { recursive: true });
    const name = item.getFilename().replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
    let to = path.join(downloads, name);
    for (let n = 2; fs.existsSync(to); n++) to = path.join(downloads, name.replace(/(\.[^.]*)?$/, ` (${n})$1`));
    item.setSavePath(to);
    item.once("done", (_ev, state) => note(state === "completed" ? `Downloaded ${path.basename(to)} into Vault › Downloads.` : `The download of ${name} didn't finish (${state}).`));
  });
  return pages;
}

const tabs = new Map(); // id → { view, loading }
let active = null;
let seq = 0;
let box = { x: 0, y: 0, w: 0, h: 0, visible: false };

const note = (text) => win?.webContents.send("seaside:browser-note", text);

function tabList() {
  return [...tabs.entries()].map(([id, t]) => {
    const wc = t.view.webContents;
    return { id, url: wc.getURL(), title: wc.getTitle(), loading: wc.isLoading(), active: id === active, canBack: wc.navigationHistory.canGoBack(), canForward: wc.navigationHistory.canGoForward(), audible: wc.isCurrentlyAudible() };
  });
}
let tabsTimer = null;
function sendTabs() {
  clearTimeout(tabsTimer);
  tabsTimer = setTimeout(() => win?.webContents.send("seaside:browser-tabs", tabList()), 30);
}

/** Only the front tab is shown, where the Browser window's page area is, and only while the Browser window says so. */
function place() {
  if (!win) return;
  for (const [id, t] of tabs) {
    const show = id === active && box.visible && box.w > 0 && box.h > 0;
    t.view.setVisible(show);
    if (show) t.view.setBounds({ x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.w), height: Math.round(box.h) });
  }
}

async function newTab(url) {
  if (!win) throw new Error("The app's window isn't open.");
  const view = new WebContentsView({ webPreferences: { session: await browserSession(), sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: true } });
  view.setBackgroundColor("#ffffff");
  const id = `n${++seq}`;
  tabs.set(id, { view });
  win.contentView.addChildView(view);
  const wc = view.webContents;
  for (const ev of ["did-start-loading", "did-stop-loading", "page-title-updated", "did-navigate", "did-navigate-in-page", "audio-state-changed"]) wc.on(ev, sendTabs);
  wc.on("did-fail-load", (_e, code, desc, failed, main) => main && code !== -3 && note(`Couldn't open ${failed}: ${desc}.`));
  // pop-ups and "open in new tab" become tabs here
  wc.setWindowOpenHandler(({ url: next }) => {
    void newTab(next).then((nid) => focus(nid));
    return { action: "deny" };
  });
  wc.on("destroyed", () => {
    tabs.delete(id);
    if (active === id) active = [...tabs.keys()].pop() ?? null;
    place();
    sendTabs();
  });
  void wc.loadURL(addressOf(url)).catch(() => undefined);
  return id;
}

function focus(id) {
  if (!tabs.has(id)) return;
  active = id;
  place();
  sendTabs();
}

const tab = (id) => tabs.get(id || active)?.view.webContents;

ipcMain.handle("seaside:browser", async (e, req) => {
  if (!win || e.sender !== win.webContents) throw new Error("Not from the desktop.");
  const op = String(req?.op || "");
  if (op === "open") {
    const id = await newTab(req.url);
    focus(id);
    return { id };
  }
  if (op === "focus") return focus(String(req.id)), { ok: true };
  if (op === "layout") {
    box = { x: Number(req.x) || 0, y: Number(req.y) || 0, w: Number(req.w) || 0, h: Number(req.h) || 0, visible: Boolean(req.visible) };
    place();
    return { ok: true };
  }
  if (op === "tabs") return tabList();
  // a still of the front tab, shown in its place while something of the desktop covers it
  if (op === "snapshot") {
    const wc = tab(req.id);
    if (!wc) return { data: "" };
    const img = await wc.capturePage();
    return { data: img.isEmpty() ? "" : img.toDataURL() };
  }
  const wc = tab(req.id);
  if (!wc) throw new Error("That tab isn't open any more.");
  if (op === "go") return void wc.loadURL(addressOf(req.url)).catch(() => undefined), { ok: true };
  if (op === "back") return wc.navigationHistory.canGoBack() && wc.navigationHistory.goBack(), { ok: true };
  if (op === "forward") return wc.navigationHistory.canGoForward() && wc.navigationHistory.goForward(), { ok: true };
  if (op === "reload") return wc.reload(), { ok: true };
  if (op === "stop") return wc.stop(), { ok: true };
  if (op === "close") {
    const t = tabs.get(req.id || active);
    if (t) {
      win.contentView.removeChildView(t.view);
      t.view.webContents.close();
    }
    return { ok: true };
  }
  if (op === "zoom") return wc.setZoomFactor(Math.max(0.3, Math.min(3, Number(req.factor) || 1))), { ok: true };
  if (op === "find") {
    if (req.text) wc.findInPage(String(req.text), { forward: req.back !== true, findNext: Boolean(req.next) });
    else wc.stopFindInPage("clearSelection");
    return { ok: true };
  }
  throw new Error(`Unknown request: ${op}`);
});

app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});
app.on("window-all-closed", () => app.quit());
app.whenReady().then(openWindow).catch((e) => {
  console.error(e);
  app.quit();
});
