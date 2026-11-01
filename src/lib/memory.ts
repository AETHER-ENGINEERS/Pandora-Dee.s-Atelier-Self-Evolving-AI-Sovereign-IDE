// Memory on this device: windows minimized for a while can be unloaded (their contents freed; they open again as
// they were kept, from the desktop's records), and everything minimized is freed when the page has been in the
// background a while. Both are off until switched on in Settings → Memory. Windows that are busy stay: a video or
// sound playing in them, a game in progress, Vector (a live messenger).

import { useSyncExternalStore } from "react";
import { APPS, desk, useDesk, type AppId } from "./store.ts";

export const MEMORY_DEFAULT = { unloadMinimizedMin: 0, freeHiddenMin: 0 };

let unloaded = new Set<AppId>();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());
export const useUnloaded = () => useSyncExternalStore((f) => (listeners.add(f), () => listeners.delete(f)), () => unloaded);

// when each window was minimized (here, not kept: a reload starts the count again)
const minimizedAt = new Map<AppId, number>();

/** A window that's doing something worth keeping: playing sound or video, a game open, Vector. */
function busy(id: AppId) {
  if (id === "vector" || (id === "games" && desk().game)) return true;
  const el = document.querySelector(`[data-win="${id}"]`);
  return Boolean(el && [...el.querySelectorAll<HTMLMediaElement>("video, audio")].some((m) => !m.paused));
}

/** Free the minimized windows (all of them, or those minimized at least `olderThan` ms ago). Returns how many. */
export function unloadMinimized(olderThan = 0) {
  const s = desk();
  const now = Date.now();
  let n = 0;
  const next = new Set(unloaded);
  for (const a of APPS) {
    const w = s.wins[a.id];
    if (!w.open || !w.min || next.has(a.id) || busy(a.id)) continue;
    if (now - (minimizedAt.get(a.id) ?? now) < olderThan) continue;
    next.add(a.id);
    n++;
  }
  if (n) {
    unloaded = next;
    changed();
  }
  return n;
}

/** The page's own memory use, where the browser tells (Chromium-based browsers), in MB. */
export function pageMemory(): number | null {
  const m = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return m ? Math.round(m.usedJSHeapSize / 1048576) : null;
}

let started = false;
export function startMemory() {
  if (started) return;
  started = true;
  // note when windows are minimized; a window shown again is loaded again
  useDesk.subscribe((s, prev) => {
    let back = false;
    for (const a of APPS) {
      const w = s.wins[a.id];
      const was = prev.wins[a.id];
      if (w.min && !was?.min) minimizedAt.set(a.id, Date.now());
      if ((!w.min || !w.open) && unloaded.has(a.id)) {
        minimizedAt.delete(a.id);
        back = true;
      }
    }
    if (back) {
      unloaded = new Set([...unloaded].filter((id) => s.wins[id].open && s.wins[id].min));
      changed();
    }
  });
  for (const a of APPS) if (desk().wins[a.id].min) minimizedAt.set(a.id, Date.now());
  // every half minute: windows minimized long enough are unloaded (when switched on)
  window.setInterval(() => {
    const m = desk().memory;
    if (m.unloadMinimizedMin > 0) unloadMinimized(m.unloadMinimizedMin * 60_000);
  }, 30_000);
  // in the background a while: everything minimized is freed
  let hiddenTimer = 0;
  document.addEventListener("visibilitychange", () => {
    window.clearTimeout(hiddenTimer);
    const m = desk().memory;
    if (document.visibilityState === "hidden" && m.freeHiddenMin > 0) hiddenTimer = window.setTimeout(() => unloadMinimized(), m.freeHiddenMin * 60_000);
  });
}

export type ServerMemory = {
  server: { rss: number; heap: number; heapTotal: number; external: number };
  computer: { total: number; free: number };
  engine: { running: boolean; viewers: number; idleMin: number; lastSlept: number };
  canClean: boolean;
  canChange: boolean;
  lastFreed: { at: number; mb: number };
  settings: { engineSleepMin: number; cleanEveryMin: number };
};
export const memoryApi = {
  status: async (): Promise<ServerMemory> => (await fetch("/api/memory")).json() as Promise<ServerMemory>,
  post: async (body: Record<string, unknown>): Promise<ServerMemory> => {
    const r = await fetch("/api/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j as { error?: string }).error || `The desktop answered ${r.status}.`);
    return j as ServerMemory;
  },
};
