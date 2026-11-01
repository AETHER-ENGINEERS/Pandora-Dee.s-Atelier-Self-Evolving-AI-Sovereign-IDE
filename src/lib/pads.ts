// PADS: Pandora's Atelier's Distributed Systems. This SEASIDE, when its person switched PADS on here (a privacy
// setting, off until then, kept on this device only), reports in to the desktop every few seconds: its name, what kind
// of device it is, its screen, and what's open on it. The PADS Manager window (apps/Pads.tsx) shows every device of
// the account and how they're arranged in the room.

import { useSyncExternalStore } from "react";
import { APPS, desk } from "./store.ts";
import { label, useMusic } from "./music.ts";

export type Kind = "phone" | "tablet" | "laptop" | "desktop" | "mac" | "console" | "tv" | "handheld" | "other";
export const KINDS: { id: Kind; name: string }[] = [
  { id: "desktop", name: "Desktop computer" },
  { id: "laptop", name: "Laptop" },
  { id: "mac", name: "Mac" },
  { id: "phone", name: "Phone" },
  { id: "tablet", name: "Tablet" },
  { id: "console", name: "Console (Xbox…)" },
  { id: "tv", name: "TV" },
  { id: "handheld", name: "Handheld" },
  { id: "other", name: "Something else" },
];

export type Win = { app: string; title: string; x: number; y: number; w: number; h: number; front: boolean; max: boolean };
export type Device = {
  id: string;
  name: string;
  kind: Kind;
  screen: { w: number; h: number; dpr: number };
  browser: string;
  seen: number;
  here: boolean;
  layout: { x: number; y: number };
  state: { windows: Win[]; hangout: boolean; phone: boolean; playing: string } | null;
  /** which SEASIDE server it's connected to (this one, or a linked one) */
  server?: string;
  serverId?: string;
};
/** A SEASIDE server in the account's PADS: this one, or one linked with it. */
export type Server = { id: string; name: string; here: boolean; me?: boolean; url?: string; error?: string };
export type ServersInfo = { me: { id: string; name: string }; servers: { id: string; name: string; url: string; created: number; seen: number }[]; canChange: boolean; addresses: string[]; lan: boolean };

type Me = { on: boolean; name: string; kind: Kind };
const ME_KEY = "pdd-pads-me";
const ID_KEY = "pdd-device-id";

const ua = () => navigator.userAgent;
/** A first guess at what this device is (the person can correct it). */
export function guessKind(): Kind {
  const u = ua();
  if (/Xbox/i.test(u)) return "console";
  if (/SMART-TV|SmartTV|Tizen|Web0S|BRAVIA|AFT[A-Z]/i.test(u)) return "tv";
  if (/iPad/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1)) return "tablet";
  if (/iPhone/.test(u) || (/Android/.test(u) && /Mobile/.test(u))) return "phone";
  if (/Android/.test(u)) return "tablet";
  if (/Mac/.test(u)) return "mac";
  return "desktop";
}
const browserName = () => {
  const u = ua();
  return /Edg\//.test(u) ? "Edge" : /OPR\//.test(u) ? "Opera" : /Firefox\//.test(u) ? "Firefox" : /Chrome\//.test(u) ? "Chrome" : /Safari\//.test(u) ? "Safari" : "a browser";
};

/** This device's lasting id (kept in this browser). */
export function deviceId(): string {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id || !/^[A-Za-z0-9_-]{8,40}$/.test(id)) {
      id = (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9]/g, "").slice(0, 24);
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return "nostorage00";
  }
}

let me: Me = (() => {
  try {
    const m = JSON.parse(localStorage.getItem(ME_KEY) || "null") as Partial<Me> | null;
    return { on: m?.on === true, name: m?.name || "", kind: (m?.kind as Kind) || guessKind() };
  } catch {
    return { on: false, name: "", kind: guessKind() };
  }
})();
const meListeners = new Set<() => void>();
export const useMe = () => useSyncExternalStore((f) => (meListeners.add(f), () => meListeners.delete(f)), () => me);
export function setMe(patch: Partial<Me>) {
  me = { ...me, ...patch };
  try {
    localStorage.setItem(ME_KEY, JSON.stringify(me));
  } catch {
    /* this browser keeps nothing */
  }
  meListeners.forEach((f) => f());
  if (me.on) void report();
}

/** What this device is called in PADS: the name given, or a sensible default. */
export const myName = () => me.name || `${KINDS.find((k) => k.id === me.kind)?.name ?? "Device"} (${browserName()})`;
export const account = () => desk().session || "";

/** What's on this SEASIDE now: its open windows (a miniature), which is in front, Hangout, music. */
function state() {
  const s = desk();
  const windows = APPS.flatMap((a) => {
    const w = s.wins[a.id];
    if (!w?.open || w.min) return [];
    return [{ app: a.id, title: a.title, x: Math.round(w.x), y: Math.round(w.y), w: Math.round(w.w), h: Math.round(w.h), front: w.z === s.zTop, max: w.max }];
  });
  const m = useMusic.getState();
  return { windows, hangout: Boolean(s.hangout), phone: innerWidth < 760, playing: m.playing ? label(m.queue[m.index]) : "" };
}

/** Report in (only while PADS is on here). */
export async function report(): Promise<Device[] | null> {
  if (!me.on) return null;
  const r = await fetch("/api/pads/hello", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: deviceId(), account: account(), name: myName(), kind: me.kind, browser: browserName(), screen: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio || 1 }, state: state() }),
  }).catch(() => null);
  if (!r?.ok) return null;
  const j = (await r.json()) as { devices: Device[]; servers?: Server[]; mail?: Mail[] };
  roster = j.devices ?? [];
  servers = j.servers ?? [];
  if (j.mail?.length) {
    inbox = [...inbox, ...j.mail].slice(-12);
    inboxListeners.forEach((f) => f());
  }
  return roster;
}

/** Something another device of this account sent here ("Send to" in its right-click menus). */
export type Mail = { from: string; fromId: string; at: number; item: { kind: "text"; text: string; title?: string } | { kind: "link"; url: string; title?: string } | { kind: "image"; path: string; title?: string } };

let roster: Device[] = [];
let servers: Server[] = [];
/** The account's devices as of the last report (for "Send to" menus). */
export const lastRoster = () => roster;
/** This server and the linked ones, as of the last report. */
export const lastServers = () => servers;

let inbox: Mail[] = [];
const inboxListeners = new Set<() => void>();
export const useInbox = () => useSyncExternalStore((f) => (inboxListeners.add(f), () => inboxListeners.delete(f)), () => inbox);
export function dismissMail(m: Mail) {
  inbox = inbox.filter((x) => x !== m);
  inboxListeners.forEach((f) => f());
}

let started = false;
/** Reports every five seconds, and when this page is about to go (so the Manager sees it leave soon). */
export function startPads() {
  if (started) return;
  started = true;
  void report();
  setInterval(() => void report(), 5000);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && void report());
}

export const padsApi = {
  roster: async (): Promise<{ devices: Device[]; servers: Server[] }> => {
    const j = (await (await fetch(`/api/pads/roster?account=${encodeURIComponent(account())}`)).json()) as { devices?: Device[]; servers?: Server[] };
    return { devices: j.devices ?? [], servers: j.servers ?? [] };
  },
  servers: async (): Promise<ServersInfo> => (await fetch("/api/pads/servers")).json() as Promise<ServersInfo>,
  /** Linking, unlinking, renaming (on the server's own computer only). */
  serverOp: async <T = unknown>(body: Record<string, string>): Promise<T> => {
    const r = await fetch("/api/pads/servers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j as { error?: string }).error || `The server answered ${r.status}.`);
    return j as T;
  },
  arrange: (positions: Record<string, { x: number; y: number }>) => fetch("/api/pads/arrange", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account: account(), positions }) }),
  send: (to: string, item: unknown) => fetch("/api/pads/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account: account(), from: deviceId(), to, item }) }),
  forget: (id: string) => fetch("/api/pads/forget", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account: account(), id }) }),
};
