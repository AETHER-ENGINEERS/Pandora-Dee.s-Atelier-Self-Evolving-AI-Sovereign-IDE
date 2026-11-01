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
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { frameMessage } from "./wsframes.mjs";
import { DOWNLOADS, exeIn } from "./ungoogled.mjs";
import { createTrackerList } from "./trackers.mjs";

// DuckDuckGo's autoconsent (MPL-2.0): says no to cookie banners. Its script for this kind of engine, and its rules.
const AUTOCONSENT = (() => {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.resolve("@duckduckgo/autoconsent")));
    return {
      script: fs.readFileSync(path.join(dir, "autoconsent.playwright.js"), "utf8"),
      rules: JSON.parse(fs.readFileSync(fileURLToPath(import.meta.resolve("@duckduckgo/autoconsent/rules/compact-rules.json")), "utf8")),
    };
  } catch {
    return null; // not installed: banners are left alone
  }
})();
const AUTOCONSENT_CONFIG = {
  autoAction: "optOut",
  disabledCmps: [],
  enablePrehide: true,
  enableCosmeticRules: true,
  enableGeneratedRules: true,
  detectRetries: 20,
  isMainWorld: false,
  prehideTimeout: 2000,
  enableHeuristicDetection: true,
  heuristicMode: "tier2",
  logs: { lifecycle: false, rulesteps: false, detectionsteps: false, evals: false, errors: false, messages: false, waits: false },
};

/** A page's site: its host without "www.". */
const siteOf = (url) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

const win = process.platform === "win32";
/** How many pixels the engine draws per page pixel: the Browser window's own screen sharpness when the engine starts
 *  (1:1, so the least work for the sharpest picture), between 1 and 2. */
const renderScaleFor = (dpr) => Math.min(2, Math.max(1, Math.round((Number(dpr) || 1) * 20) / 20));
const mac = process.platform === "darwin";

/** What each kind of engine is good at, shown beside it. */
const ABOUT = {
  brave: "Privacy-minded Chromium. (Its own ad blocker may not run here.)",
  chromium: "Plain Chromium, as Google's open-source project builds it.",
  chrome: "Google's own: the browser most sites are tested with; Google sign-in.",
  edge: "Microsoft's: sites made for Edge or Chrome; Microsoft account sign-in.",
  vivaldi: "Vivaldi's build of Chromium.",
  opera: "Opera's build of Chromium (slower to start: it goes through its launcher).",
  thorium: "Thorium: Chromium compiled for speed.",
  supermium: "Supermium: Chromium that also runs on older Windows.",
  yandex: "Yandex Browser.",
  cromite: "Cromite: privacy-hardened, ad blocking built in.",
};

/** Chromium-family browsers already on this computer (the only kind that can be shown live here), best for privacy
 *  first. Each channel (Beta, Dev, Canary…) is its own choice. */
export function installedEngines() {
  const pf = process.env["ProgramFiles"] || "C:\\Program Files";
  const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const both = (...rel) => [path.join(pf, ...rel), path.join(pf86, ...rel), path.join(local, ...rel)];
  const W = (id, kind, name, ...rels) => rels.flatMap((rel) => both(...rel).map((p) => [id, kind, name, p]));
  const candidates = win
    ? [
        ...W("brave", "brave", "Brave", ["BraveSoftware", "Brave-Browser", "Application", "brave.exe"]),
        ...W("brave-beta", "brave", "Brave Beta", ["BraveSoftware", "Brave-Browser-Beta", "Application", "brave.exe"]),
        ...W("brave-nightly", "brave", "Brave Nightly", ["BraveSoftware", "Brave-Browser-Nightly", "Application", "brave.exe"]),
        ...W("cromite", "cromite", "Cromite (installed)", ["Cromite", "Application", "chrome.exe"]),
        ...W("chromium", "chromium", "Chromium", ["Chromium", "Application", "chrome.exe"]),
        ...W("thorium", "thorium", "Thorium", ["Thorium", "Application", "thorium.exe"]),
        ...W("vivaldi", "vivaldi", "Vivaldi", ["Vivaldi", "Application", "vivaldi.exe"]),
        ...W("chrome", "chrome", "Google Chrome", ["Google", "Chrome", "Application", "chrome.exe"]),
        ...W("chrome-beta", "chrome", "Google Chrome Beta", ["Google", "Chrome Beta", "Application", "chrome.exe"]),
        ...W("chrome-dev", "chrome", "Google Chrome Dev", ["Google", "Chrome Dev", "Application", "chrome.exe"]),
        ...W("chrome-canary", "chrome", "Google Chrome Canary", ["Google", "Chrome SxS", "Application", "chrome.exe"]),
        ...W("edge", "edge", "Microsoft Edge", ["Microsoft", "Edge", "Application", "msedge.exe"]),
        ...W("edge-beta", "edge", "Microsoft Edge Beta", ["Microsoft", "Edge Beta", "Application", "msedge.exe"]),
        ...W("edge-dev", "edge", "Microsoft Edge Dev", ["Microsoft", "Edge Dev", "Application", "msedge.exe"]),
        ...W("edge-canary", "edge", "Microsoft Edge Canary", ["Microsoft", "Edge SxS", "Application", "msedge.exe"]),
        ...W("opera", "opera", "Opera", ["Programs", "Opera", "opera.exe"], ["Opera", "opera.exe"]),
        ...W("opera-gx", "opera", "Opera GX", ["Programs", "Opera GX", "opera.exe"]),
        ...W("supermium", "supermium", "Supermium", ["Supermium", "chrome.exe"]),
        ...W("yandex", "yandex", "Yandex Browser", ["Yandex", "YandexBrowser", "Application", "browser.exe"]),
      ]
    : mac
      ? [
          ["brave", "brave", "Brave", "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"],
          ["brave-beta", "brave", "Brave Beta", "/Applications/Brave Browser Beta.app/Contents/MacOS/Brave Browser Beta"],
          ["chromium", "chromium", "Chromium", "/Applications/Chromium.app/Contents/MacOS/Chromium"],
          ["thorium", "thorium", "Thorium", "/Applications/Thorium.app/Contents/MacOS/Thorium"],
          ["vivaldi", "vivaldi", "Vivaldi", "/Applications/Vivaldi.app/Contents/MacOS/Vivaldi"],
          ["chrome", "chrome", "Google Chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
          ["chrome-beta", "chrome", "Google Chrome Beta", "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta"],
          ["chrome-canary", "chrome", "Google Chrome Canary", "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary"],
          ["edge", "edge", "Microsoft Edge", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"],
          ["edge-beta", "edge", "Microsoft Edge Beta", "/Applications/Microsoft Edge Beta.app/Contents/MacOS/Microsoft Edge Beta"],
          ["opera", "opera", "Opera", "/Applications/Opera.app/Contents/MacOS/Opera"],
        ]
      : [
          ["brave", "brave", "Brave", "/usr/bin/brave-browser"],
          ["brave-beta", "brave", "Brave Beta", "/usr/bin/brave-browser-beta"],
          ["chromium", "chromium", "Chromium", "/usr/bin/chromium"],
          ["chromium", "chromium", "Chromium", "/usr/bin/chromium-browser"],
          ["chromium", "chromium", "Chromium", "/snap/bin/chromium"],
          ["thorium", "thorium", "Thorium", "/usr/bin/thorium-browser"],
          ["vivaldi", "vivaldi", "Vivaldi", "/usr/bin/vivaldi"],
          ["chrome", "chrome", "Google Chrome", "/usr/bin/google-chrome"],
          ["chrome-beta", "chrome", "Google Chrome Beta", "/usr/bin/google-chrome-beta"],
          ["edge", "edge", "Microsoft Edge", "/usr/bin/microsoft-edge"],
          ["opera", "opera", "Opera", "/usr/bin/opera"],
          ["yandex", "yandex", "Yandex Browser", "/usr/bin/yandex-browser"],
        ];
  const seen = new Set();
  return candidates
    .filter(([id, , , p]) => !seen.has(id) && fs.existsSync(p) && seen.add(id))
    .map(([id, kind, name, p]) => ({ id, name, path: p, about: ABOUT[kind] ?? "" }));
}

/** A profile folder per engine, so two brands or versions of Chromium never share one. Edge keeps the one the
 *  full browser has always used (nobody signed out); Ungoogled Chromium keeps its own. */
const profileFor = (name) => (name === "Microsoft Edge" ? "default" : name === "Ungoogled Chromium" ? "ungoogled" : name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "other");

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
function startFresh(profile, keepHistory = true) {
  const file = path.join(profile, "Default", "Preferences");
  try {
    const prefs = JSON.parse(fs.readFileSync(file, "utf8"));
    prefs.session = { ...prefs.session, restore_on_startup: 5 };
    prefs.profile = { ...prefs.profile, exit_type: "Normal", exited_cleanly: true };
    fs.writeFileSync(file, JSON.stringify(prefs));
  } catch {
    /* a new profile: nothing to restore yet */
  }
  // the browser's own record of its last session (Brave and Opera reopen it whatever the setting says); the
  // desktop keeps where you left off itself (browser/session.json)
  for (const name of ["Sessions", "Sessions_Encrypted", "Current Session", "Current Tabs", "Last Session", "Last Tabs"]) {
    fs.rmSync(path.join(profile, "Default", name), { recursive: true, force: true });
  }
  // no browsing history kept (unless chosen): the pages visited, the address bar's suggestions, links shown as visited
  if (!keepHistory)
    for (const name of ["History", "History-journal", "Visited Links", "Top Sites", "Top Sites-journal", "Shortcuts", "Shortcuts-journal", "Network Action Predictor", "Network Action Predictor-journal"]) {
      fs.rmSync(path.join(profile, "Default", name), { recursive: true, force: true });
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
  // the look pages are asked for: light or dark (the Browser window sends its device's own, or the one chosen), and
  // Chromium's automatic darkening for sites without a dark look of their own
  let look = { scheme: "light", darken: false };
  // how the pictures are made: sharp (the screen's own sharpness, quality 85), balanced (quality 72), or smooth
  // (quality 60 at one page pixel per picture pixel): lighter pictures come faster, for animation and scrolling
  const PICTURES = { sharp: { quality: 85, scale: 1 }, balanced: { quality: 72, scale: 1 }, smooth: { quality: 60, scale: 0 } };
  let picture = "sharp";
  let error = "";
  let paused = null;

  const send = (res, type, data) => {
    try {
      return res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      clients.delete(res);
      return true;
    }
  };
  // Frames go to each viewer only as fast as its connection takes them: while one is still on its way, only the
  // newest waits (older ones are dropped), so a slow phone or Wi-Fi never falls further and further behind.
  const waiting = new Map(); // viewer → the newest frame not sent yet
  const draining = new Set(); // viewers with a drain listener already
  function whenDrained(res) {
    if (draining.has(res)) return;
    draining.add(res);
    res.once("drain", () => {
      draining.delete(res);
      const next = waiting.get(res);
      waiting.delete(res);
      if (next && clients.has(res)) sendFrame(res, next);
    });
  }
  function sendFrame(res, frame) {
    if (res.writableNeedDrain) {
      waiting.set(res, frame);
      return whenDrained(res);
    }
    if (!send(res, "frame", frame)) whenDrained(res);
  }
  const broadcast = (type, data) => clients.forEach((c) => send(c, type, data));
  const tabList = () =>
    [...tabs.entries()].map(([id, t]) => ({
      id,
      url: t.url,
      title: t.title,
      loading: t.loading,
      active: id === active,
      // privacy on this page: trackers stopped (and which), whether a cookie banner was answered "no", protection off here
      blocked: t.blocked?.n ?? 0,
      trackers: t.blocked ? [...t.blocked.list].slice(0, 12) : [],
      banner: t.banner ?? "",
      consent: t.consent ?? "",
      unprotected: privacy().allow.includes(siteOf(t.url)),
    }));
  let pushSoonTimer = null;
  const pushTabsSoon = () => {
    if (pushSoonTimer) return;
    pushSoonTimer = setTimeout(() => ((pushSoonTimer = null), broadcast("tabs", { tabs: tabList(), engine: engineName })), 400);
  };
  const pushTabs = () => {
    broadcast("tabs", { tabs: tabList(), engine: engineName });
    saveSoon();
  };

  // ---- where you left off: the open tabs, the front one, and how far down each page was (unless switched off) ----
  const browserDir = () => path.join(dataDir(), "browser");
  const sessionFile = () => path.join(browserDir(), "session.json");
  const settingsFile = () => path.join(browserDir(), "settings.json");
  const readJson = (f, fallback) => {
    try {
      return JSON.parse(fs.readFileSync(f, "utf8"));
    } catch {
      return fallback;
    }
  };
  const writeJson = (f, data) => {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(`${f}.tmp`, JSON.stringify(data, null, 1));
    fs.renameSync(`${f}.tmp`, f);
  };
  const remembering = () => readJson(settingsFile(), {}).remember !== false;
  /** The privacy layer: trackers blocked, cookie banners answered "no", Global Privacy Control, no history kept;
   *  and the sites where protection is off (a site that broke). */
  const privacy = () => {
    const p = readJson(settingsFile(), {}).privacy ?? {};
    return { trackers: p.trackers !== false, banners: p.banners !== false, gpc: p.gpc !== false, history: p.history === true, allow: Array.isArray(p.allow) ? p.allow : [] };
  };
  const trackerList = createTrackerList({ dir: () => path.join(browserDir(), "privacy") });
  let saveTimer = null;
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void saveSession(), 1500);
  }
  let restoring = 0; // while pages are being put back where they were, saving waits (or it would note "top")
  async function saveSession() {
    if (!ctx || !remembering() || Date.now() < restoring) return;
    const list = [];
    for (const [id, t] of tabs) {
      const url = t.page.url();
      if (!/^https?:/.test(url)) continue;
      const scroll = await t.page.evaluate(() => [Math.round(scrollX), Math.round(scrollY)]).catch(() => [0, 0]);
      list.push({ url, title: t.title, scroll, active: id === active });
    }
    if (ctx) writeJson(sessionFile(), { at: Date.now(), tabs: list });
  }
  // scrolling doesn't change the tabs, so where each page is gets noted now and then too
  setInterval(() => ctx && remembering() && void saveSession(), 15_000).unref?.();

  /** Reopen what was open, each page scrolled back to where it was. */
  async function restoreSession(saved) {
    const list = saved.tabs.filter((t) => /^https?:/.test(t.url)).slice(0, 30);
    let front = null;
    restoring = Date.now() + 30_000;
    const back = [];
    for (const s of list) {
      const blank = [...tabs.entries()].find(([, t]) => t.url === "about:blank" && !t.loading);
      const id = blank ? blank[0] : await adopt(await newTab(), false);
      const t = tabs.get(id);
      if (!t) continue;
      const [x, y] = Array.isArray(s.scroll) ? s.scroll : [0, 0];
      t.loading = true;
      // the page itself loaded, then scrolled back to where it was
      back.push(
        t.page
          .goto(s.url, { waitUntil: "load", timeout: 60_000 })
          .then(() => (x || y) && t.page.evaluate(([a, b]) => scrollTo(a, b), [x, y]))
          .catch(() => undefined),
      );
      if (s.active || !front) front = id;
    }
    if (front) await watch(front);
    pushTabs();
    void Promise.all(back).finally(() => {
      restoring = 0;
      saveSoon();
    });
    return list.length;
  }

  /** Engines downloaded into the data folder (Ungoogled Chromium, Cromite), as choices. */
  const downloaded = () =>
    DOWNLOADS.map((d) => ({ id: d.id, name: d.name, path: exeIn(path.join(dataDir(), "browser", d.folder)), about: d.about })).filter((d) => fs.existsSync(d.path));

  /** The engine to run: the one chosen; otherwise (Automatic) the one used last, so finding another browser on
   *  the computer never switches it silently; otherwise a downloaded one, then the most private one installed. */
  function pick() {
    const choice = getChoice() || {};
    if (choice.path && fs.existsSync(choice.path)) return { name: choice.name || path.basename(choice.path), path: choice.path };
    const last = readJson(settingsFile(), {}).lastUsed;
    if (last?.path && fs.existsSync(last.path)) return { name: last.name, path: last.path };
    // (desktops from before this was noted: a browser that already has a profile here was the one in use)
    const used = [...downloaded(), ...installedEngines()].find((e) => fs.existsSync(path.join(dataDir(), "browser", "profiles", profileFor(e.name))));
    if (used) return { name: used.name, path: used.path };
    const own = downloaded()[0] ?? installedEngines()[0];
    return own ? { name: own.name, path: own.path } : null;
  }
  /** After a choice or a download, Automatic picks afresh. */
  const forgetLast = () => {
    const st = readJson(settingsFile(), {});
    if (st.lastUsed) writeJson(settingsFile(), { ...st, lastUsed: undefined });
  };

  async function start() {
    while (paused) await paused; // its files are being replaced (a new Ungoogled Chromium)
    if (ctx) return ctx;
    if (starting) return starting;
    starting = (async () => {
      const eng = pick();
      if (!eng) throw Object.assign(new Error("No Chromium-family browser found on this computer (Edge, Chrome, Brave or Chromium)."), { status: 409 });
      const { chromium } = await import("playwright-core");
      // a profile of its own per engine (two brands or versions of Chromium mustn't share one; Edge keeps its old one)
      const profile = path.join(dataDir(), "browser", "profiles", profileFor(eng.name));
      fs.mkdirSync(profile, { recursive: true });
      startFresh(profile, privacy().history);
      const launch = () => chromium.launchPersistentContext(profile, {
        executablePath: eng.path,
        headless: true,
        // no fixed viewport: each tab is sized to the Browser window (fit, below)
        viewport: null,
        acceptDownloads: true,
        downloadsPath: path.join(dataDir(), "vault", "Downloads"),
        // drawn at twice the pixels, then scaled down to each screen's own sharpness by the stream: crisp text on any
        // screen up to 2× (a page can't be made sharper from inside, the screencast ignores that)
        args: ["--no-first-run", "--no-default-browser-check", "--disable-features=Translate,MediaRouter", "--hide-scrollbars=false", `--force-device-scale-factor=${renderScaleFor(view.dpr)}`],
        ignoreDefaultArgs: ["--enable-automation"],
        // Chromium's own sandbox stays on: this engine opens any site (Playwright turns it off unless asked)
        chromiumSandbox: true,
      });
      let c;
      try {
        c = await launch();
      } catch {
        // most often: a previous run's engine still has the profile open
        freeProfile(profile);
        await new Promise((r) => setTimeout(r, 800));
        startFresh(profile, privacy().history);
        c = await launch();
      }
      engineName = eng.name;
      writeJson(settingsFile(), { ...readJson(settingsFile(), {}), lastUsed: { name: eng.name, path: eng.path } });
      // pages can't reach the desktop's controls, or anything else on this computer; trackers are stopped (privacy)
      await c.route("**/*", (route) => {
        const req = route.request();
        const url = req.url();
        if (forbidden(url, deskPorts)) return route.abort("blockedbyclient");
        let page = null, frame = null;
        try {
          frame = req.frame();
          page = frame.page();
        } catch {
          return route.continue(); // a service worker's own request
        }
        const t = [...tabs.values()].find((x) => x.page === page);
        // the page itself, going somewhere new: its counts start again
        if (req.isNavigationRequest() && frame === page.mainFrame()) {
          if (t) (t.blocked = { n: 0, list: new Set() }), (t.banner = "");
          return route.continue();
        }
        const p = privacy();
        const pageUrl = page.url();
        if (p.trackers && !p.allow.includes(siteOf(pageUrl))) {
          const d = trackerList.get()?.decide(url, pageUrl, req.resourceType());
          if (d?.block) {
            if (t) {
              t.blocked ??= { n: 0, list: new Set() };
              t.blocked.n++;
              t.blocked.list.add(d.tracker);
              pushTabsSoon();
            }
            return route.abort("blockedbyclient");
          }
        }
        return route.continue();
      });
      // Global Privacy Control: asked of every site, with each request and to its scripts
      if (privacy().gpc) {
        await c.setExtraHTTPHeaders({ "Sec-GPC": "1" }).catch(() => undefined);
        await c.addInitScript(() => Object.defineProperty(Navigator.prototype, "globalPrivacyControl", { get: () => true, configurable: true })).catch(() => undefined);
      }
      // cookie banners answered "no" (DuckDuckGo's autoconsent), unless switched off or off for the site
      if (AUTOCONSENT) {
        const reply = (frame, msg) => frame.evaluate((m) => window.autoconsentReceiveMessage?.(m), msg).catch(() => undefined);
        await c
          .exposeBinding("autoconsentSendMessage", async (source, msg) => {
            if (!msg || typeof msg !== "object") return;
            const p = privacy();
            // what autoconsent last reported on the page (for "why did that banner get through?")
            if (source.frame === source.page?.mainFrame() && msg.type !== "eval") {
              const t = [...tabs.values()].find((x) => x.page === source.page);
              if (t) t.consent = msg.type === "cmpDetected" || msg.type === "popupFound" ? `${msg.type}: ${msg.cmp}` : msg.type;
            }
            const site = siteOf(source.page?.url() ?? "");
            if (msg.type === "init") return reply(source.frame, { type: "initResp", config: { ...AUTOCONSENT_CONFIG, enabled: p.banners && !p.allow.includes(site) }, rules: AUTOCONSENT.rules });
            if (msg.type === "eval") {
              const result = await source.frame.evaluate(msg.code).catch(() => false);
              return reply(source.frame, { type: "evalResp", id: msg.id, result });
            }
            if ((msg.type === "optOutResult" && msg.result) || msg.type === "autoconsentDone") {
              const t = [...tabs.values()].find((x) => x.page === source.page);
              if (t && !t.banner) (t.banner = msg.cmp || "a cookie banner"), pushTabsSoon();
            }
          })
          .catch(() => undefined);
        await c.addInitScript({ content: AUTOCONSENT.script }).catch(() => undefined);
      }
      // some browsers (Brave, Opera, Opera GX) open their own welcome pages as they start: pages a browser opens by
      // itself in its first seconds are closed; our own new tabs and pages' real pop-ups stay
      startupUntil = Date.now() + 10_000;
      c.on("page", async (p) => {
        // decided the moment it appears (one of ours finishes opening while the opener is looked up)
        const suspect = Date.now() < startupUntil && !ownNew;
        if (suspect && !(await p.opener().catch(() => null))) return void p.close().catch(() => undefined);
        void adopt(p, true);
      });
      c.on("close", () => {
        ctx = null;
        tabs.clear();
        active = null;
        pushTabs();
      });
      ctx = c;
      // the first page it starts with is kept (it becomes the first tab); any others it opened are welcome pages
      const [first, ...more] = c.pages();
      for (const p of more) await p.close().catch(() => undefined);
      if (first) await adopt(first, false);
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

  let startupUntil = 0;
  let ownNew = 0; // new tabs we're opening right now (so they're never taken for a welcome page)
  async function newTab() {
    ownNew++;
    try {
      return await ctx.newPage();
    } finally {
      ownNew--;
    }
  }

  /** A page the engine opened (a new tab, or a site's pop-up): track it, and show it if it's new. */
  const known = new WeakMap(); // page → the tab being set up for it, so a page announced twice is one tab
  function adopt(page, show) {
    // a page that's gone before it's set up (Opera's launcher swaps its first page as it starts) is skipped: null
    if (!known.has(page)) known.set(page, setUp(page, show).catch(() => null));
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
    await dress(cdp);
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
      if (active !== id) return;
      const head = { id, w: f.metadata.deviceWidth, h: f.metadata.deviceHeight };
      // binary to the viewers on the WebSocket (one message, made once), base64 text to any that can't use it
      if (sockets.size) {
        const msg = frameMessage(head, Buffer.from(f.data, "base64"));
        for (const s of sockets) sendBinary(s, msg);
      }
      for (const c of clients) if (!picturesElsewhere.has(c)) sendFrame(c, { ...head, data: f.data });
    });
    if (show || !active) await watch(id);
    pushTabs();
    return id;
  }

  /** One tab asked for the chosen look (prefers-color-scheme), and darkened when that's chosen. */
  async function dress(cdp) {
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: look.scheme }] }).catch(() => undefined);
    await cdp.send("Emulation.setAutoDarkModeOverride", look.darken ? { enabled: true } : {}).catch(() => undefined);
  }

  /** One tab drawn at the Browser window's size, sharpness, and phone-or-not. */
  async function fit(cdp) {
    // deviceScaleFactor 0: keep the engine's own (the render scale it started with)
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
    saveSoon(); // which tab is in front is part of where you left off
    const t = tabs.get(id);
    if (!t) return;
    await t.page.bringToFront().catch(() => undefined);
    // quality 90 keeps text crisp; the picture is sent at the device's own pixels and shown 1:1
    const pic = PICTURES[picture] ?? PICTURES.sharp;
    const k = pic.scale ? view.dpr : 1; // smooth: the page's own size (its pixels, not the screen's)
    await t.cdp.send("Page.startScreencast", { format: "jpeg", quality: pic.quality, maxWidth: Math.round(view.w * k), maxHeight: Math.round(view.h * k), everyNthFrame: 1 }).catch(() => undefined);
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
  let lastUse = 0; // when anything (a window, a character) last asked the engine to do something
  async function cmd(b) {
    const op = String(b.op || "");
    lastUse = Date.now();
    if (op === "stop") {
      await ctx?.close().catch(() => undefined);
      return { ok: true };
    }
    // the window's sharpness rides along with its requests, so the engine starts at the right scale whichever comes first
    if (!ctx && b.dpr) view = { ...view, dpr: Math.max(1, Math.min(3, Number(b.dpr) || 1)) };
    await start();
    // the Browser window's first request: pick up where it was left off, unless asked for the start page
    if (op === "open" && b.start) {
      if ([...tabs.values()].some((t) => t.url !== "about:blank")) return { id: active }; // already open (another device)
      const saved = b.reopen !== false && remembering() ? readJson(sessionFile(), null) : null;
      if (saved?.tabs?.length) return { restored: await restoreSession(saved) };
    }
    if (op === "remember") {
      writeJson(settingsFile(), { ...readJson(settingsFile(), {}), remember: Boolean(b.on) });
      if (b.on) await saveSession();
      else fs.rmSync(sessionFile(), { force: true });
      return { ok: true };
    }
    if (op === "forget") return fs.rmSync(sessionFile(), { force: true }), { ok: true };
    if (op === "privacy") {
      const now = privacy();
      const next = { ...now };
      for (const k of ["trackers", "banners", "gpc", "history"]) if (typeof b[k] === "boolean") next[k] = b[k];
      // protection off (or back on) for one site
      if (b.site) {
        const site = String(b.site).toLowerCase().replace(/^www\./, "");
        next.allow = b.protect === false ? [...new Set([...now.allow, site])] : now.allow.filter((x) => x !== site);
      }
      writeJson(settingsFile(), { ...readJson(settingsFile(), {}), privacy: next });
      if (next.trackers) trackerList.get(); // fetched now, ready for the next page
      pushTabs();
      // the privacy signal pages read, and the history setting, take effect when the engine next starts
      return { privacy: next, restartNeeded: now.gpc !== next.gpc || now.history !== next.history };
    }
    // forget this site: its cookies (signed out) and everything it stored, then the page again
    if (op === "forget-site") {
      const t = tab(b.id);
      const site = siteOf(t.page.url());
      if (!site) return { ok: false };
      const esc = site.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      await ctx.clearCookies({ domain: new RegExp(`(^|\\.)${esc}$`) }).catch(() => undefined);
      for (const origin of [`https://${site}`, `https://www.${site}`, `http://${site}`, `http://www.${site}`])
        await t.cdp.send("Storage.clearDataForOrigin", { origin, storageTypes: "all" }).catch(() => undefined);
      void t.page.reload().catch(() => undefined);
      return { ok: true, site };
    }
    // cookies (signed-in sites sign out), the cache, and the open sites' stored data
    if (op === "clear-data") {
      await ctx.clearCookies().catch(() => undefined);
      const any = [...tabs.values()][0];
      if (any) await any.cdp.send("Network.clearBrowserCache").catch(() => undefined);
      const origins = new Set([...tabs.values()].map((t) => { try { return new URL(t.page.url()).origin; } catch { return ""; } }).filter((o) => o.startsWith("http")));
      for (const origin of origins) await any?.cdp.send("Storage.clearDataForOrigin", { origin, storageTypes: "all" }).catch(() => undefined);
      return { ok: true, sites: origins.size };
    }
    if (op === "open") {
      // the empty tab the engine starts with is used first, rather than left behind
      const blank = [...tabs.entries()].find(([, t]) => t.url === "about:blank" && !t.loading);
      let id = blank ? blank[0] : await adopt(await newTab(), true);
      if (!id) id = await adopt(await newTab(), true); // it vanished while starting: once more
      if (!id) throw Object.assign(new Error("The browser closed the new tab as it opened; try again."), { status: 503 });
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
    if (op === "picture") {
      picture = PICTURES[b.picture] ? b.picture : "sharp";
      if (active) await watch(active);
      return { ok: true };
    }
    if (op === "look") {
      look = { scheme: b.scheme === "dark" ? "dark" : "light", darken: Boolean(b.darken) };
      for (const t of tabs.values()) await dress(t.cdp);
      return { ok: true };
    }
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
      const x = Number(b.x) || 0, y = Number(b.y) || 0, dx = Number(b.dx) || 0, dy = Number(b.dy) || 0, mods = Number(b.mods) || 0;
      // plain scrolling glides, frame by frame, as in a browser window (a wheel message is applied in one jump
      // here, which looked skippy); with keys held (Ctrl+wheel zooms) it stays a wheel message
      const d = Math.hypot(dx, dy);
      if (!mods && d) {
        const speed = Math.min(8000, Math.max(1600, d * 8)); // pixels a second: a notch takes about 120 ms
        const ok = await t.cdp.send("Input.synthesizeScrollGesture", { x, y, xDistance: -dx, yDistance: -dy, speed, gestureSourceType: "mouse", preventFling: true }).then(() => true, () => false);
        if (ok) return { ok: true };
      }
      await t.cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: dx, deltaY: dy, modifiers: mods });
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

  // viewers taking pictures over the WebSocket (binary); their event stream then carries only tabs and notes
  const sockets = new Set();
  const picturesElsewhere = new WeakSet();
  const socketWaiting = new Map();
  /** The same "latest wins" as the event stream: while one picture is on its way, only the newest waits. */
  function sendBinary(s, msg) {
    if (s.destroyed) return void sockets.delete(s);
    if (s.writableNeedDrain) {
      const first = !socketWaiting.has(s);
      socketWaiting.set(s, msg);
      if (first)
        s.once("drain", () => {
          const next = socketWaiting.get(s);
          socketWaiting.delete(s);
          if (next && sockets.has(s)) sendBinary(s, next);
        });
      return;
    }
    s.write(msg);
  }
  /** A viewer's picture socket (already accepted): pictures go there from now on. */
  function attachSocket(s) {
    sockets.add(s);
    const gone = () => (sockets.delete(s), socketWaiting.delete(s));
    s.on("close", gone);
    s.on("error", gone);
    if (active) void watch(active); // a fresh picture for the newcomer
  }

  /** The Browser window's live stream: tabs, notes, and pictures unless they come by the WebSocket (`frames=0`). */
  function stream(res, frames = true) {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    clients.add(res);
    if (!frames) picturesElsewhere.add(res);
    send(res, "tabs", { tabs: tabList(), engine: engineName });
    const ping = setInterval(() => res.write(": ping\n\n"), 20_000);
    res.on("close", () => {
      clearInterval(ping);
      clients.delete(res);
      waiting.delete(res);
      draining.delete(res);
    });
    if (active) void watch(active); // a fresh frame for the newcomer
  }

  const status = () => ({ running: Boolean(ctx), engine: engineName, view, picture, privacy: privacy(), trackerList: trackerList.status(), platform: process.platform, remember: remembering(), saved: (readJson(sessionFile(), null)?.tabs ?? []).length, using: pick(), chosen: getChoice()?.path && fs.existsSync(getChoice().path) ? getChoice().path : "" /* a download that never finished isn't a choice */, installed: installedEngines(), error, tabs: tabList() });

  /** Close the engine (when the desktop's server stops), noting where everything was first. */
  const close = async () => {
    await saveSession().catch(() => undefined);
    await ctx?.close().catch(() => undefined);
  };

  /** Stop it, so the next use starts the engine now chosen (tabs reopen from scratch). */
  const restart = async () => {
    const was = tabList().map((t) => t.url).filter((u) => u && u !== "about:blank");
    await saveSession().catch(() => undefined);
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

  /** For memory.mjs: running or not, how many are watching, and when it was last used. */
  const activity = () => ({ running: Boolean(ctx), viewers: clients.size + sockets.size, lastUse });

  return { cmd, stream, attachSocket, status, installedEngines, downloaded, forgetLast, close, restart, hold, activity };
}
