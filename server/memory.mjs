// Memory on the desktop's computer: what the server and the full browser are using, and (when switched on; both are
// off until then) putting the browser engine to sleep after a while with nobody watching or using it, and a regular
// clean-up of the server's own memory. A sleeping engine wakes on next use, its tabs back where they were.

import os from "node:os";
import v8 from "node:v8";
import vm from "node:vm";

const MIN = 60_000;

/** The JavaScript engine's own clean-up, made callable without starting Node with --expose-gc. */
function collector() {
  try {
    v8.setFlagsFromString("--expose_gc");
    const gc = vm.runInNewContext("gc");
    return typeof gc === "function" ? gc : null;
  } catch {
    return null;
  }
}

export function createMemory({ engine, readConfig, writeConfig }) {
  const gc = collector();
  const settings = () => {
    const c = readConfig().memory ?? {};
    return { engineSleepMin: Math.max(0, Number(c.engineSleepMin) || 0), cleanEveryMin: Math.max(0, Number(c.cleanEveryMin) || 0) };
  };
  let lastWatched = Date.now();
  let lastClean = Date.now();
  let lastSlept = 0;
  let lastFreed = { at: 0, mb: 0 };

  const mb = (n) => Math.round(n / 1048576);
  function status() {
    const m = process.memoryUsage();
    const e = engine.activity();
    return {
      server: { rss: mb(m.rss), heap: mb(m.heapUsed), heapTotal: mb(m.heapTotal), external: mb(m.external) },
      computer: { total: mb(os.totalmem()), free: mb(os.freemem()) },
      engine: { running: e.running, viewers: e.viewers, idleMin: e.running && !e.viewers ? Math.floor((Date.now() - Math.max(lastWatched, e.lastUse)) / MIN) : 0, lastSlept },
      canClean: Boolean(gc),
      lastFreed,
      settings: settings(),
    };
  }

  /** Clean up now: the server's memory (and the engine too, when it's asleep-worthy: no one watching). */
  function clean() {
    const before = process.memoryUsage().rss;
    gc?.();
    lastClean = Date.now();
    lastFreed = { at: lastClean, mb: Math.max(0, mb(before - process.memoryUsage().rss)) };
    return lastFreed;
  }

  async function sleepEngine() {
    if (!engine.activity().running) return false;
    await engine.restart();
    lastSlept = Date.now();
    return true;
  }

  // every half minute: note whether anyone is watching the browser, and do what's switched on
  const timer = setInterval(() => {
    const s = settings();
    const e = engine.activity();
    if (e.viewers) lastWatched = Date.now();
    if (s.engineSleepMin && e.running && !e.viewers && Date.now() - Math.max(lastWatched, e.lastUse) > s.engineSleepMin * MIN) void sleepEngine().then(() => gc?.());
    if (s.cleanEveryMin && Date.now() - lastClean > s.cleanEveryMin * MIN) clean();
  }, 30_000);
  timer.unref?.();

  function set(patch) {
    const cur = settings();
    const next = {
      engineSleepMin: patch.engineSleepMin === undefined ? cur.engineSleepMin : Math.min(24 * 60, Math.max(0, Math.round(Number(patch.engineSleepMin) || 0))),
      cleanEveryMin: patch.cleanEveryMin === undefined ? cur.cleanEveryMin : Math.min(24 * 60, Math.max(0, Math.round(Number(patch.cleanEveryMin) || 0))),
    };
    writeConfig({ memory: next });
    return status();
  }

  return { status, clean, sleepEngine, set };
}
