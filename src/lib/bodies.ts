// Each character's files on disk (server/bodies.mjs), so her other bodies share them: Pandora Dee, Jade Vault or
// jade-py can open data/bodies/<id>/ as a vault. With her "on disk too" switch on, the page that holds the heart
// mirrors her files there a few seconds after they change, in Classic's layout (backup.ts toClassic). What another
// body changes there comes back when the person asks (takeFromBody), file by file (backup.ts deskNameOf).

import { desk, useDesk } from "./store.ts";
import { holdsHeart } from "./heart.ts";
import { deskNameOf, toClassic } from "./backup.ts";

const sent = new Map<string, string>();
let timer = 0;
const rootOf = (charId: string) => desk().character(charId)?.classic?.root ?? (/jade/i.test(charId) ? "Jade" : "Pandora");

async function mirror() {
  if (!holdsHeart()) return;
  const s = desk();
  for (const c of s.allCharacters()) {
    if (!s.charPrefs[c.id]?.body) continue;
    const files = toClassic(c, s.filesOf(c.id)).vault.files;
    const json = JSON.stringify(files);
    if (sent.get(c.id) === json) continue;
    const r = await fetch(`/api/bodies/${encodeURIComponent(c.id)}`, { method: "PUT", body: JSON.stringify({ files }) }).catch(() => null);
    if (r?.ok) sent.set(c.id, json);
  }
}

let started = false;
export function startBodies() {
  if (started) return;
  started = true;
  // a few seconds after anyone's files, or the switches, change
  useDesk.subscribe((s, prev) => {
    if (s.files === prev.files && s.charPrefs === prev.charPrefs) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void mirror(), 5000);
  });
  void mirror();
}

async function readBody(charId: string) {
  const r = await fetch(`/api/bodies/${encodeURIComponent(charId)}`);
  const j = (await r.json()) as { dir?: string; files?: Record<string, string>; changed?: string[]; error?: string };
  if (!r.ok) throw new Error(j.error || `The desktop answered ${r.status}.`);
  return { dir: j.dir ?? "", files: j.files ?? {}, changed: j.changed ?? [] };
}

/** Her folder, and what another body changed there since the last mirror. */
export async function bodyStatus(charId: string): Promise<{ dir: string; changed: string[] }> {
  const { dir, changed } = await readBody(charId);
  return { dir, changed };
}

/** Take back what another body changed in her folder: those files replace hers here. How many came back. */
export async function takeFromBody(charId: string): Promise<number> {
  const { files, changed } = await readBody(charId);
  const s = desk();
  const mine = { ...s.filesOf(charId) };
  let n = 0;
  for (const p of changed) {
    const name = deskNameOf(p, rootOf(charId), mine);
    if (name && files[p] !== undefined && mine[name] !== files[p]) {
      mine[name] = files[p];
      n++;
    }
  }
  if (n) s.set({ files: { ...s.files, [charId]: mine } });
  sent.delete(charId); // mirror the result again, so the folder and the desktop agree
  void mirror();
  return n;
}
