// The heart, on the page (server/heart.mjs): this page beats every few seconds and learns whether it holds the heart.
// Only the holder polls the bridges, answers the inbound API and takes heartbeats. If the server can't say (an older
// server, a dropped connection), the page acts as the holder, so nothing goes quiet by accident.
//
// With "keep them running" on, the holder keeps the server's copy of the desktop's state current. The keeper (the
// desktop opened headless while it's closed here) and a desktop reopening after one take that copy up in bootHeart,
// before the store reads it. Nothing here imports the store, for that reason.

const KEY = "pandora-dee-desktop";
const ADOPTED = "pdd-heart-adopted";

export const isKeeper = new URLSearchParams(location.search).has("keeper");
const page = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
let hold: boolean | null = null;
let keep = false;
let sent = "";
let handing = false;

/** True when this page does the background work (or no one can say otherwise). */
export const holdsHeart = () => hold !== false && !handing;

/** Before the store loads: the keeper takes up the saved state; a desktop reopening after a keeper takes up what happened. */
export async function bootHeart() {
  try {
    if (isKeeper) {
      const j = (await (await fetch("/api/heart/state?keeper=1")).json()) as { fresh?: boolean; blob?: string };
      if (j.fresh && j.blob) localStorage.setItem(KEY, j.blob);
      return;
    }
    const since = Number(localStorage.getItem(ADOPTED) || 0);
    const r = await fetch(`/api/heart/state?since=${since}`);
    if (!r.ok) return; // not on this computer, or an older server
    const j = (await r.json()) as { fresh?: boolean; blob?: string; savedAt?: number };
    if (j.fresh && j.blob) {
      localStorage.setItem(KEY, j.blob);
      localStorage.setItem(ADOPTED, String(j.savedAt ?? Date.now()));
    }
  } catch {
    // no heart on this server: the page starts as it always has
  }
}

async function save(final: boolean) {
  const blob = localStorage.getItem(KEY) ?? "";
  if (!final && blob === sent) return;
  const r = await fetch("/api/heart/state", { method: "PUT", body: JSON.stringify({ page, blob, final }) });
  if (r.ok) sent = blob;
}

async function beat() {
  try {
    const r = await fetch("/api/heart/beat", { method: "POST", body: JSON.stringify({ page, keeper: isKeeper }) });
    if (!r.ok) return void (hold = null);
    const j = (await r.json()) as { hold?: boolean; keep?: boolean; handBack?: boolean };
    hold = Boolean(j.hold);
    keep = Boolean(j.keep);
    if (j.handBack && !handing) {
      // the desktop is back: stop, save what happened, and let the server close this page
      handing = true;
      await save(true).catch(() => undefined);
    } else if (hold && keep) await save(false);
  } catch {
    hold = null;
  }
}

let started = false;
export function startHeart() {
  if (started) return;
  started = true;
  void beat();
  window.setInterval(() => void beat(), 10_000);
  // the last word as this page closes
  let left = false;
  const leave = () => {
    if (left) return;
    left = true;
    if (hold && keep && !isKeeper) navigator.sendBeacon("/api/heart/state", JSON.stringify({ page, blob: localStorage.getItem(KEY) ?? "", final: false }));
    // and let go of the heart now, so another page (or this one, reloaded) takes it at once
    if (!isKeeper) navigator.sendBeacon("/api/heart/leave", JSON.stringify({ page }));
  };
  // some browsers skip pagehide on a reload; beforeunload covers those
  window.addEventListener("pagehide", leave);
  window.addEventListener("beforeunload", leave);
}
