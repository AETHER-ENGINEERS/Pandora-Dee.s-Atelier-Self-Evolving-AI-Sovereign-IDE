// Each character's own keys (server/residentKeys.mjs). Her keys are used first wherever {{NAME}} is filled for her,
// then the household's Keys. Values are held here in memory only: never in the store, the conversation or a backup.
// They load only where the server shows them (this computer, or Tailscale's https); elsewhere only the names are known.

import { useSyncExternalStore } from "react";
import { desk } from "./store.ts";

let names: Record<string, string[]> = {};
let values: Record<string, Record<string, string>> = {};
let canSee = false;
const listeners = new Set<() => void>();
const changed = () => {
  snapshot = { names, canSee };
  listeners.forEach((f) => f());
};
let snapshot = { names, canSee };
export const useResidentKeys = () => useSyncExternalStore((f) => (listeners.add(f), () => listeners.delete(f)), () => snapshot);

export async function loadResidentKeys() {
  try {
    const r = (await (await fetch("/api/resident-keys")).json()) as { names?: Record<string, string[]>; canSee?: boolean };
    names = r.names ?? {};
    canSee = Boolean(r.canSee);
    const next: typeof values = {};
    if (canSee)
      for (const id of Object.keys(names)) {
        const v = (await (await fetch(`/api/resident-keys/${encodeURIComponent(id)}/values`)).json()) as { values?: Record<string, string> };
        next[id] = v.values ?? {};
      }
    values = next;
  } catch {
    // the server isn't reachable: no resident keys this time
  }
  changed();
}

/** Set one of her keys (an empty value removes it). Only works where the server shows values. */
export async function setResidentKey(charId: string, name: string, value: string) {
  const r = await fetch(`/api/resident-keys/${encodeURIComponent(charId)}`, { method: "PUT", body: JSON.stringify({ name, value }) });
  const j = (await r.json()) as { names?: string[]; error?: string };
  if (!r.ok) throw new Error(j.error || `The desktop answered ${r.status}.`);
  names = { ...names, [charId]: j.names ?? [] };
  values = { ...values, [charId]: { ...(values[charId] ?? {}), [name]: value } };
  if (!value) delete values[charId][name];
  changed();
}

/** The keys {{NAME}} is filled from for this character: hers first, then the household's. */
export function envFor(charId?: string): Record<string, string> {
  const own = charId ? values[charId] : undefined;
  return own && Object.keys(own).length ? { ...desk().env, ...own } : desk().env;
}

/** Every key value known here, for blanking out of anything shown or written. */
export function allKeyValues(): Record<string, string> {
  const out: Record<string, string> = { ...desk().env };
  for (const [id, v] of Object.entries(values)) for (const [k, val] of Object.entries(v)) out[`${id}:${k}`] = val;
  return out;
}
