// The desktop's full browser: a real Chromium-family engine (Ungoogled Chromium by choice, or an installed Edge, Chrome
// or Brave) running on the computer with the desktop, shown live in the Browser window on any device that opens the
// desktop. People and characters use the same engine. It has its own profile in the data folder (never the person's
// own browser profile), so sites keep their logins and caches there; pages can't reach the desktop's own controls.
//
// The Browser window gets the picture as a stream of frames (Chromium's screencast), and sends clicks, scrolling and
// typing back, the way a remote desktop does.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const win = process.platform === "win32";
/** How many pixels the engine draws per page pixel. */
const RENDER_SCALE = 2;
const mac = process.platform === "darwin";

/** Chromium-family browsers already on this computer, best for privacy first. */
export function installedEngines() {
  const pf = process.env["ProgramFiles"] || "C:\\Program Files";
  const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const candidates = win
    ? [
        ["brave", "Brave", path.join(pf, "BraveSoftware", "Brave-Browser", "Application", "brave.exe")],
        ["brave", "Brave", path.join(local, "BraveSoftware", "Brave-Browser", "Application", "brave.exe")],
        ["chrome", "Google Chrome", path.join(pf, "Google", "Chrome", "Application", "chrome.exe")],
        ["chrome", "Google Chrome", path.join(local, "Google", "Chrome", "Application", "chrome.exe")],
        ["edge", "Microsoft Edge", path.join(pf86, "Microsoft", "Edge", "Application", "msedge.exe")],
        ["edge", "Microsoft Edge", path.join(pf, "Microsoft", "Edge", "Application", "msedge.exe")],
      ]
    : mac
      ? [
          ["brave", "Brave", "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"],
          ["chromium", "Chromium", "/Applications/Chromium.app/Contents/MacOS/Chromium"],
          ["chrome", "Google Chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
          ["edge", "Microsoft Edge", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"],
        ]
      : [
          ["chromium", "Chromium", "/usr/bin/chromium"],
          ["chromium", "Chromium", "/usr/bin/chromium-browser"],
          ["brave", "Brave", "/usr/bin/brave-browser"],
          ["chrome", "Google Chrome", "/usr/bin/google-chrome"],
          ["edge", "Microsoft Edge", "/usr/bin/microsoft-edge"],
        ];
  const seen = new Set();
  return candidates.filter(([id, , p]) => fs.existsSync(p) && !seen.has(id) && seen.add(id)).map(([id, name, p]) => ({ id, name, path: p }));
}

/** Addresses a page must never reach through the engine: this computer itself, and the desktop wherever it answers. */
function forbidden(url, deskPorts) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (!/^(https?|wss?):$/.test(u.protocol)) return false;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h === "::1" || h === "0.0.0.0" || /^127\./.test(h)) return true;
  const port = u.port || (u.protocol === "https:" || u.protocol === "wss:" ? "443" : "80");
  return deskPorts().includes(Number(port)) && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.)/.test(h);
}

/** A previous run's engine still holding this profile (the desktop was stopped without closing it): end it. Only
 *  processes started with exactly this profile folder are touched, never the person's own browser. */
function freeProfile(profile) {
  try {
    if (win) {
      const ps = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*--user-data-dir=${profile.replace(/'/g, "''")}*' -and $_.CommandLine -notlike '*--type=*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`;
      execFileSync("powershell.exe", ["-NoProfile", "-Command", ps], { stdio: "ignore", timeout: 15_000 });
    } else execFileSync("pkill", ["-f", `--user-data-dir=${profile}`], { stdio: "ignore", timeout: 15_000 });
  } catch {
    /* nothing to end, or not allowed: the launch reports it */
  }
}

/** The engine starts with an empty tab, not the last session: a session coming back after the desktop had already
 *  opened a page would replace that page (a blank first tab) or open it twice. Also marks the last run as a clean
 *  exit, so no "restore pages?" bar appears inside the page. */
function startFresh(profile) {
  const file = path.join(profile, "Default", "Preferences");
  try {
    const prefs = JSON.parse(fs.readFileSync(file, "utf8"));
    prefs.session = { ...prefs.session, restore_on_startup: 5 };
    prefs.profile = { ...prefs.profile, exit_type: "Normal", exited_cleanly: true };
    fs.writeFileSync(file, JSON.stringify(prefs));
  } catch {
    /* a new profile: nothing to restore yet */
  }
}

export function createEngine({ dataDir, getChoice, deskPorts }) {
  let ctx = null; // the running engine (a persistent context: its own profile)
  let starting = null;
  let engineName = "";
  let ua = ""; // the engine's own browser identity, without "Headless"
  const tabs = new Map(); // id → { page, cdp, url, title, loading }
  let active = null;
  let seq = 0;
  const clients = new Set(); // SSE responses
  let view = { w: 1100, h: 700, dpr: 1, mobile: false };
  let error = "";
  let paused = null;

  const send = (res, type, data) => {
    try {
      res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      clients.delete(res);
    }
  };
  const broadcast = (type, data) => clients.forEach((c) => send(c, type, data));
  const tabList = () => [...tabs.entries()].map(([id, t]) => ({ id, url: t.url, title: t.title, loading: t.loading, active: id === active }));
  const pushTabs = () => broadcast("tabs", { tabs: tabList(), engine: engineName });

  function pick() {
    const choice = getChoice() || {};
    const found = installedEngines();
    if (choice.path && fs.existsSync(choice.path)) return { name: choice.name || path.basename(choice.path), path: choice.path };
    const own = path.join(dataDir(), "browser", "engine");
    // a downloaded Ungoogled Chromium in the data folder comes first (the private choice)
    const ownExe = win ? path.join(own, "chrome.exe") : mac ? path.join(own, "Chromium.app", "Contents", "MacOS", "Chromium") : path.join(own, "chrome");
    if (fs.existsSync(ownExe)) return { name: "Ungoogled Chromium", path: ownExe };
    return found[0] ? { name: found[0].name, path: found[0].path } : null;
  }

  async function start() {
    while (paused) await paused; // its files are being replaced (a new Ungoogled Chromium)
    if (ctx) return ctx;
    if (starting) return starting;
    starting = (async () => {
      const eng = pick();
      if (!eng) throw Object.assign(new Error("No Chromium-family browser found on this computer (Edge, Chrome, Brave or Chromium)."), { status: 409 });
      const { chromium } = await import("playwright-core");
      // Ungoogled Chromium keeps a profile of its own (two brands and versions of Chromium mustn't share one);
      // the installed browsers keep the one they always had, so nobody is signed out
      const profile = path.join(dataDir(), "browser", "profiles", eng.name === "Ungoogled Chromium" ? "ungoogled" : "default");
      fs.mkdirSync(profile, { recursive: true });
      startFresh(profile);
      const launch = () => chromium.launchPersistentContext(profile, {
        executablePath: eng.path,
        headless: true,
        // no fixed viewport: each tab is sized to the Browser window (fit, below)
        viewport: null,
        acceptDownloads: true,
        downloadsPath: path.join(dataDir(), "vault", "Downloads"),
        // drawn at twice the pixels, then scaled down to each screen's own sharpness by the stream: crisp text on any
        // screen up to 2× (a page can't be made sharper from inside, the screencast ignores that)
        args: ["--no-first-run", "--no-default-browser-check", "--disable-features=Translate,MediaRouter", "--hide-scrollbars=false", `--force-device-scale-factor=${RENDER_SCALE}`],
        ignoreDefaultArgs: ["--enable-automation"],
      });
      let c;
      try {
        c = await launch();
      } catch {
        // most often: a previous run's engine still has the profile open
        freeProfile(profile);
        await new Promise((r) => setTimeout(r, 800));
        startFresh(profile);
        c = await launch();
      }
      engineName = eng.name;
      // pages can't reach the desktop's controls, or anything else on this computer
      await c.route("**/*", (route) => (forbidden(route.request().url(), deskPorts) ? route.abort("blockedbyclient") : route.continue()));
      c.on("page", (p) => void adopt(p, true));
      c.on("close", () => {
        ctx = null;
        tabs.clear();
        active = null;
        pushTabs();
      });
      ctx = c;
      for (const p of c.pages()) await adopt(p, false);
      return c;
    })();
    try {
      return await starting;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      starting = null;
    }
  }

  /** A page the engine opened (a new tab, or a site's pop-up): track it, and show it if it's new. */
  const known = new WeakMap(); // page → the tab being set up for it, so a page announced twice is one tab
  function adopt(page, show) {
    if (!known.has(page)) known.set(page, setUp(page, show));
    return known.get(page);
  }
  async function setUp(page, show) {
    const id = `t${++seq}`;
    const cdp = await page.context().newCDPSession(page);
    // the engine runs without a window of its own; sites see the browser it really is (no "Headless" in its name),
    // like any copy of it a person opens, so ordinary sites don't take the person for a bot
    if (!ua) ua = String(await page.evaluate(() => navigator.userAgent).catch(() => "")).replace(/Headless/g, "");
    if (ua) await cdp.send("Network.setUserAgentOverride", { userAgent: ua }).catch(() => undefined);
    // drawn at the Browser window's own size and sharpness, so the picture is never stretched (that was the blur)
    await fit(cdp);
    const t = { page, cdp, url: page.url(), title: "", loading: false };
    tabs.set(id, t);
    const upd = async () => {
      t.url = page.url();
      t.title = await page.title().catch(() => t.title);
      pushTabs();
    };
    page.on("framenavigated", (f) => f === page.mainFrame() && void upd());
    page.on("load", () => ((t.loading = false), void upd()));
    page.on("domcontentloaded", () => void upd());
    page.on("close", () => {
      tabs.delete(id);
      if (active === id) {
        active = [...tabs.keys()].pop() ?? null;
        if (active) void watch(active);
      }
      pushTabs();
    });
    page.on("dialog", (d) => void (d.type() === "beforeunload" ? d.accept() : d.dismiss()).catch(() => undefined));
    page.on("download", (dl) => {
      const to = path.join(dataDir(), "vault", "Downloads", dl.suggestedFilename().replace(/[<>:"/\\|?*\x00-\x1f]/g, "_"));
      fs.mkdirSync(path.dirname(to), { recursive: true });
      void dl.saveAs(to).then(() => broadcast("note", { text: `Downloaded ${path.basename(to)} into Vault › Downloads.` }), () => undefined);
    });
    cdp.on("Page.screencastFrame", (f) => {
      void cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => undefined);
      if (active === id) broadcast("frame", { id, data: f.data, w: f.metadata.deviceWidth, h: f.metadata.deviceHeight });
    });
    if (show || !active) await watch(id);
    pushTabs();
    return id;
  }

  /** One tab drawn at the Browser window's size, sharpness, and phone-or-not. */
  async function fit(cdp) {
    // deviceScaleFactor 0: keep the engine's own (RENDER_SCALE)
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: view.w, height: view.h, deviceScaleFactor: 0, mobile: view.mobile }).catch(() => undefined);
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: view.mobile }).catch(() => undefined);
  }

  /** Stream this tab's picture (and stop the one before). */
  async function watch(id) {
    // stopped first even when it's the same tab: a running screencast keeps the size limits it started with, so
    // after the window changed size every frame was squeezed to the old size and stretched back (the blur)
    const prev = active && tabs.get(active);
    if (prev) await prev.cdp.send("Page.stopScreencast").catch(() => undefined);
    active = id;
    const t = tabs.get(id);
    if (!t) return;
    await t.page.bringToFront().catch(() => undefined);
    // quality 90 keeps text crisp; the picture is sent at the device's own pixels and shown 1:1
    await t.cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: Math.round(view.w * view.dpr), maxHeight: Math.round(view.h * view.dpr), everyNthFrame: 1 }).catch(() => undefined);
  }

  const tab = (id) => {
    const t = tabs.get(id || active);
    if (!t) throw Object.assign(new Error("That tab isn't open any more."), { status: 404 });
    return t;
  };
  const go = (t, url) => {
    t.loading = true;
    pushTabs();
    void t.page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch((e) => broadcast("note", { text: `Couldn't open ${url}: ${String(e.message || e).split("\n")[0]}` }));
  };

  /** Address bar text: an address as is, a name with a dot as https, anything else a search. */
  function addressOf(text) {
    const s = String(text || "").trim();
    if (!s) return "about:blank";
    if (/^(https?:|about:)/i.test(s)) return s;
    if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(s)) return `https://${s}`;
    return `https://duckduckgo.com/?q=${encodeURIComponent(s)}`;
  }

  /** Everything the Browser window asks for. */
  async function cmd(b) {
    const op = String(b.op || "");
    if (op === "stop") {
      await ctx?.close().catch(() => undefined);
      return { ok: true };
    }
    await start();
    if (op === "open") {
      // the empty tab the engine starts with is used first, rather than left behind
      const blank = [...tabs.entries()].find(([, t]) => t.url === "about:blank" && !t.loading);
      const id = blank ? blank[0] : await adopt(await ctx.newPage(), true);
      if (blank) await watch(id);
      if (b.url) go(tabs.get(id), addressOf(b.url));
      return { id };
    }
    if (op === "view") {
      const w = Math.max(320, Math.min(3840, Math.round(Number(b.w) || view.w)));
      const h = Math.max(240, Math.min(2400, Math.round(Number(b.h) || view.h)));
      const dpr = Math.max(1, Math.min(3, Number(b.dpr) || 1));
      view = { w, h, dpr, mobile: Boolean(b.mobile) };
      for (const t of tabs.values()) await fit(t.cdp);
      if (active) await watch(active);
      return { ok: true };
    }
    if (op === "focus") return await watch(String(b.id)), { ok: true };
    const t = tab(b.id);
    if (op === "go") return go(t, addressOf(b.url)), { ok: true };
    if (op === "back") return void t.page.goBack().catch(() => undefined), { ok: true };
    if (op === "forward") return void t.page.goForward().catch(() => undefined), { ok: true };
    if (op === "reload") return void t.page.reload().catch(() => undefined), { ok: true };
    if (op === "close") return await t.page.close().catch(() => undefined), { ok: true };
    if (op === "mouse") {
      const type = { down: "mousePressed", up: "mouseReleased", move: "mouseMoved" }[b.type] || "mouseMoved";
      await t.cdp.send("Input.dispatchMouseEvent", { type, x: Number(b.x) || 0, y: Number(b.y) || 0, button: b.button || "none", buttons: Number(b.buttons) || 0, clickCount: Number(b.count) || (type === "mouseMoved" ? 0 : 1), modifiers: Number(b.mods) || 0 });
      return { ok: true };
    }
    if (op === "wheel") {
      await t.cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: Number(b.x) || 0, y: Number(b.y) || 0, deltaX: Number(b.dx) || 0, deltaY: Number(b.dy) || 0, modifiers: Number(b.mods) || 0 });
      return { ok: true };
    }
    if (op === "key") {
      const base = { key: String(b.key || ""), code: String(b.code || ""), windowsVirtualKeyCode: Number(b.keyCode) || 0, modifiers: Number(b.mods) || 0 };
      if (b.type === "up") await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
      else await t.cdp.send("Input.dispatchKeyEvent", { type: b.text ? "keyDown" : "rawKeyDown", text: b.text || undefined, unmodifiedText: b.text || undefined, ...base });
      return { ok: true };
    }
    if (op === "text") return await t.cdp.send("Input.insertText", { text: String(b.text || "") }), { ok: true };
    throw Object.assign(new Error(`Unknown request: ${op}`), { status: 400 });
  }

  /** The Browser window's live stream: tabs, frames, notes. */
  function stream(res) {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    clients.add(res);
    send(res, "tabs", { tabs: tabList(), engine: engineName });
    const ping = setInterval(() => res.write(": ping\n\n"), 20_000);
    res.on("close", () => {
      clearInterval(ping);
      clients.delete(res);
    });
    if (active) void watch(active); // a fresh frame for the newcomer
  }

  const status = () => ({ running: Boolean(ctx), engine: engineName, view, using: pick(), chosen: getChoice()?.path || "", installed: installedEngines(), error, tabs: tabList() });

  /** Close the engine (when the desktop's server stops). */
  const close = () => ctx?.close().catch(() => undefined);

  /** Stop it, so the next use starts the engine now chosen (tabs reopen from scratch). */
  const restart = async () => {
    const was = tabList().map((t) => t.url).filter((u) => u && u !== "about:blank");
    await ctx?.close().catch(() => undefined);
    ctx = null;
    return was;
  };

  /** Stop it and keep it stopped until `release` is called (while its program's files are replaced). */
  const hold = async () => {
    let release = () => {};
    paused = new Promise((r) => (release = r));
    await restart();
    return () => {
      paused = null;
      release();
    };
  };

  return { cmd, stream, status, installedEngines, close, restart, hold };
}
