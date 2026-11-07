// The heart: one page at a time does the desktop's background work: it polls the Vector and Discord bridges,
// answers the inbound API and takes the heartbeats. Every open page beats every few seconds, and the server says
// which one holds the heart: the desktop on this computer first, else the keeper, else the first page to arrive.
//
// "Keep them running" (off until switched on, on this computer): the page holding the heart keeps a copy of the
// desktop's state here, sealed under the resident vault's master key (it holds the household's Keys). When the
// desktop on this computer has been closed a minute, the server opens the desktop itself in a headless browser (the
// keeper) with that copy, and the keeper holds the heart. When the desktop opens again, it asks for the copy; the
// keeper saves what happened, steps down and closes, and the desktop picks up from there.

import fs from "node:fs";
import path from "node:path";

export const ALIVE_MS = 25_000;
export const CLOSED_MS = 60_000;
const HANDBACK_MS = 20_000;

/**
 * seal/open: the vault's sealing (residentKeys.mjs). launch(url): opens the keeper and returns { close }.
 * now: for tests.
 */
export function createHeart({ dataDir, seal, open, launch, now = Date.now }) {
  const pages = new Map(); // page id → { first, at, onPc, keeper }
  let keeper = null; // { close, startedAt, handingBack, waiters: [] }
  let lastDesk = now();
  let deskPort = 0;
  const dir = () => path.join(dataDir(), "heart");
  const cfgFile = () => path.join(dir(), "config.json");
  const stateFile = () => path.join(dir(), "state.sealed");

  const config = () => {
    try {
      return { keep: false, ...JSON.parse(fs.readFileSync(cfgFile(), "utf8")) };
    } catch {
      return { keep: false };
    }
  };
  const alive = () => [...pages.entries()].filter(([, p]) => now() - p.at < ALIVE_MS);
  const deskAlive = () => alive().some(([, p]) => p.onPc && !p.keeper);

  function holder() {
    const a = alive().sort((x, y) => x[1].first - y[1].first);
    return (a.find(([, p]) => p.onPc && !p.keeper) ?? a.find(([, p]) => p.keeper && !keeper?.handingBack) ?? a.find(([, p]) => !p.keeper))?.[0] ?? null;
  }

  function closeKeeper() {
    const k = keeper;
    keeper = null;
    for (const [id, p] of pages) if (p.keeper) pages.delete(id);
    if (k) {
      for (const w of k.waiters) w();
      Promise.resolve(k.close?.()).catch(() => undefined);
    }
  }

  function readState() {
    try {
      return open(fs.readFileSync(stateFile(), "utf8"));
    } catch {
      return null;
    }
  }

  return {
    config,
    setConfig(c) {
      fs.mkdirSync(dir(), { recursive: true });
      fs.writeFileSync(cfgFile(), JSON.stringify({ ...config(), keep: Boolean(c.keep) }));
      if (!c.keep) closeKeeper();
      return config();
    },

    /** A page's beat. onPc comes from the server (the request was made on this computer); keeper is trusted only then. */
    beat(id, { onPc, keeper: isKeeper, port }) {
      const prev = pages.get(id);
      const k = Boolean(isKeeper && onPc);
      pages.set(id, { first: prev?.first ?? now(), at: now(), onPc: Boolean(onPc), keeper: k });
      if (onPc && !k) {
        lastDesk = now();
        if (port) deskPort = port;
      }
      const h = holder();
      return { hold: h === id, keep: config().keep, handBack: k && Boolean(keeper?.handingBack) };
    },

    /** A page closing or reloading lets go at once, so the heart doesn't sit with it for the last seconds of its beat. */
    leave(id) {
      if (!pages.get(id)?.keeper) pages.delete(id);
    },

    /** The page holding the heart saves the desktop's state (the keeper's last save hands it back). */
    put(id, blob, final) {
      if (!config().keep) return { ok: false, why: "off" };
      const p = pages.get(id);
      const fromKeeper = Boolean(p?.keeper);
      if (holder() !== id && !(fromKeeper && final)) return { ok: false, why: "not the heart" };
      fs.mkdirSync(dir(), { recursive: true });
      fs.writeFileSync(stateFile(), seal({ savedAt: now(), fromKeeper, blob: String(blob) }), { mode: 0o600 });
      if (fromKeeper && final) closeKeeper();
      return { ok: true };
    },

    /**
     * The desktop opening (or the keeper starting) asks for the state. With a keeper running, the desktop waits for
     * it to save and step down first. `since`: the keeper save it already took; nothing newer means nothing to adopt.
     */
    async get({ forKeeper, since = 0 }) {
      if (keeper && !forKeeper) {
        keeper.handingBack = true;
        await new Promise((resolve) => {
          keeper.waiters.push(resolve);
          setTimeout(resolve, HANDBACK_MS).unref?.();
        });
        if (keeper) closeKeeper(); // it didn't answer in time: the last save stands
      }
      const st = readState();
      if (!st) return { fresh: false };
      if (forKeeper) return { fresh: true, savedAt: st.savedAt, blob: st.blob };
      return st.fromKeeper && st.savedAt > since ? { fresh: true, savedAt: st.savedAt, blob: st.blob } : { fresh: false };
    },

    /** Every few seconds: open the keeper when the desktop has been closed a while, or close it when it isn't wanted. */
    async tick() {
      const c = config();
      if (!c.keep) return keeper && closeKeeper();
      if (keeper) {
        // it never started beating, or stopped: close it, and try again next time
        const kp = alive().some(([, p]) => p.keeper);
        if (!kp && now() - keeper.startedAt > CLOSED_MS) closeKeeper();
        return;
      }
      if (deskAlive() || now() - lastDesk < CLOSED_MS || !deskPort || !fs.existsSync(stateFile())) return;
      keeper = { close: null, startedAt: now(), handingBack: false, waiters: [] };
      const k = keeper;
      try {
        const opened = await launch(`http://localhost:${deskPort}/?keeper=1`);
        if (keeper === k) k.close = opened.close;
        else await opened.close();
      } catch (e) {
        if (keeper === k) keeper = null;
        console.warn(`[heart] couldn't open the keeper: ${e.message}`);
      }
    },

    status: () => ({ keep: config().keep, keeper: Boolean(keeper), handingBack: Boolean(keeper?.handingBack), pages: alive().length, holderIsDesk: deskAlive() }),
    close: closeKeeper,
  };
}
