// Accounts that travel between devices (server/travel.mjs). While the signed-in account travels, a copy of this
// desktop (characters, settings, windows, the open chat) goes to the desktop's server a few seconds after each change;
// signing in here, or coming back to this page, picks up a newer copy saved from another device. Keys, the adult
// passcode and the list of accounts on this device never travel: each device keeps its own.

import { desk, useDesk, type Account, type Store } from "./store.ts";
import { deviceName } from "./devshare.ts";
import { matches } from "./secure.ts";

export type Traveller = { name: string; picture: string; role: Account["role"]; password: boolean; at: number; device: string };
type Record_ = { account: Account; state: Partial<Store>; device: string; at: number };

/** This browser, so a copy it saved itself isn't picked up again as news. */
const DEVICE = (() => {
  try {
    let id = localStorage.getItem("pdd-device-id");
    if (!id) localStorage.setItem("pdd-device-id", (id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`));
    return id;
  } catch {
    return `${Date.now().toString(36)}`;
  }
})();
const deviceLabel = () => `${deviceName()} · ${DEVICE}`;

/** What stays on each device, whatever comes in: its own keys, accounts, passcode and who's signed in here. */
const LOCAL = ["env", "accounts", "kept", "adult", "session", "adultOpen", "sensorPass", "busy", "game", "toast"] as const;

const seen = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem("pdd-travel-seen") || "{}");
  } catch {
    return {};
  }
};
const markSeen = (name: string, at: number) => {
  try {
    localStorage.setItem("pdd-travel-seen", JSON.stringify({ ...seen(), [name]: at }));
  } catch {
    /* fine: the next pick-up just repeats */
  }
};

/** The part of the desktop that travels: what this browser keeps for itself, minus what stays on each device. */
function snapshot(): Partial<Store> {
  const part = (useDesk.persist.getOptions().partialize?.(desk()) ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(part)) if (!(LOCAL as readonly string[]).includes(k) && typeof v !== "function") out[k] = v;
  return JSON.parse(JSON.stringify(out));
}

async function call<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `The desktop answered ${r.status}.`);
  return j as T;
}

export const travellers = () => call<Traveller[]>("/api/travel");
const record = (name: string) => call<Record_>(`/api/travel/state?name=${encodeURIComponent(name)}`);

let applying = false;
let lastSent = "";

/** Keep this account's desktop on the server now (when it travels). */
export async function sendNow(name = desk().session ?? "") {
  const account = desk().accounts.find((a) => a.name === name);
  if (!account?.travels) return;
  const state = snapshot();
  const text = JSON.stringify(state);
  if (text === lastSent) return;
  const r = await call<{ at: number }>(`/api/travel/state?name=${encodeURIComponent(name)}`, { account, state, device: deviceLabel() });
  lastSent = text;
  markSeen(name, r.at);
}

/** Take in a copy saved on another device, keeping this device's own keys, accounts and passcode. */
function apply(r: Record_) {
  applying = true;
  try {
    const keep: Record<string, unknown> = {};
    for (const k of LOCAL) keep[k] = (desk() as unknown as Record<string, unknown>)[k];
    desk().set({ ...(r.state as Partial<Store>), ...(keep as Partial<Store>) });
    lastSent = JSON.stringify(snapshot());
    markSeen(r.account.name, r.at);
  } finally {
    applying = false;
  }
}

/** If another device saved this account's desktop since this one last saw it, pick it up. True if it did. */
export async function pickUp(name = desk().session ?? ""): Promise<boolean> {
  const account = desk().accounts.find((a) => a.name === name);
  if (!account?.travels) return false;
  let r: Record_;
  try {
    r = await record(name);
  } catch {
    return false; // nothing kept yet, or the desktop can't be reached: carry on with this device's own
  }
  if (r.at <= (seen()[name] ?? 0) || r.device === deviceLabel()) return false;
  apply(r);
  desk().say(`Picked up where you left off (${r.device.split(" · ")[0]}).`);
  return true;
}

/** Bring an account that travels onto this device (after its password, if it has one), and open its desktop. */
export async function bringHere(name: string, password = ""): Promise<Account> {
  const r = await record(name);
  if (r.account.sealed && !(await matches(password.normalize("NFC"), r.account.sealed)) && !(await matches(password, r.account.sealed)))
    throw new Error("That password doesn't match.");
  const account: Account = { ...r.account, travels: true };
  const others = desk().accounts.filter((a) => a.name.toLowerCase() !== name.toLowerCase());
  desk().set({ accounts: [...others, account] });
  apply(r);
  desk().set({ session: account.name });
  return account;
}

/** Switch travelling on or off for an account. Off removes the copy kept on the server. */
export async function setTravels(name: string, on: boolean) {
  desk().set({ accounts: desk().accounts.map((a) => (a.name === name ? { ...a, travels: on } : a)) });
  if (on) {
    lastSent = "";
    await sendNow(name);
  } else await call(`/api/travel/stop?name=${encodeURIComponent(name)}`, {});
}

let started = false;
/** Keep the signed-in account's copy up to date, and pick up newer ones when signing in or coming back to the page. */
export function startTravel() {
  if (started) return;
  started = true;
  let timer = 0;
  useDesk.subscribe((s, prev) => {
    if (s.session !== prev.session && s.session) void pickUp(s.session);
    if (applying || !s.session || s.toast !== prev.toast || s.busy !== prev.busy) return;
    if (!s.accounts.find((a) => a.name === s.session)?.travels) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void sendNow().catch(() => undefined), 3000);
  });
  document.addEventListener("visibilitychange", () => {
    const name = desk().session;
    if (!name) return;
    // leaving: save now; coming back: pick up what another device saved meanwhile
    if (document.visibilityState === "hidden") void sendNow(name).catch(() => undefined);
    else void pickUp(name);
  });
  if (desk().session) void pickUp(desk().session!);
}
