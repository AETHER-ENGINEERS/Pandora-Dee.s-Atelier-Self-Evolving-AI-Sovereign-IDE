// Backups to your own server (Classic's jade-backup-server.py works as is), on a schedule or now.
// Encrypted here first when asked, so the server never sees the contents.

import { desk } from "./store.ts";
import { allowed, blockedBecause } from "./privacy.ts";
import { outbound } from "./outbound.ts";

const send = (url: string, init: Parameters<typeof outbound>[1] = {}) => outbound(url, init, desk().net.via);

const enc = new TextEncoder();
const dec = new TextDecoder();
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function keyFrom(pass: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: salt as Uint8Array<ArrayBuffer>, iterations: 210_000 }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function encrypt(text: string, pass: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyFrom(pass, salt), enc.encode(text));
  // A large backup: base64 in chunks to avoid call-stack limits.
  const bytes = new Uint8Array(data);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return JSON.stringify({ format: "pandora-dee-desktop-backup", enc: "aes-256-gcm", kdf: "pbkdf2-sha256-210000", salt: b64(salt), iv: b64(iv), data: btoa(s) });
}

async function decrypt(env: { salt: string; iv: string; data: string }, pass: string) {
  const out = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(env.iv) }, await keyFrom(pass, unb64(env.salt)), unb64(env.data));
  return dec.decode(out);
}

/** What goes into a backup. Keys only when asked (and then always encrypted). */
export function payload(what: "full" | "config", includeKeys: boolean) {
  const s = desk();
  const base = {
    format: "pandora-dee-desktop",
    version: 1,
    kind: what,
    made: new Date().toISOString(),
    custom: s.custom,
    files: Object.fromEntries(Object.entries(s.files).map(([id, tree]) => [id, what === "full" ? tree : Object.fromEntries(Object.entries(tree).filter(([p]) => /^(SOUL|AGENTS|SYSTEM|MEMORY)\.md$/.test(p)))])),
    charPrefs: s.charPrefs,
    model: s.model,
    mcp: s.mcp,
    bridges: s.bridges,
    privacy: s.privacy,
    voice: s.voice,
    hang: s.hang,
    dock: s.dock,
    keys: s.keys,
    web: s.web,
    ...(what === "full" ? { members: s.members, messages: s.messages, inbox: s.inbox, journalsIncluded: true } : {}),
    envNames: Object.keys(s.env),
    ...(includeKeys ? { env: s.env, sshHosts: s.sshHosts } : { sshHosts: s.sshHosts.map((h) => ({ ...h, password: "", key: "" })) }),
  };
  return JSON.stringify(base);
}

function server() {
  const s = desk();
  const b = s.backup;
  if (!b.url) throw new Error("No backup server address yet (Settings → Backup and reset).");
  if (!allowed(s.privacy, "backup")) throw new Error(blockedBecause(s.privacy, "backup"));
  const token = s.env[b.keyName] ?? "";
  if (!token) throw new Error(`The server token isn't set (Keys → ${b.keyName}).`);
  return { base: b.url.replace(/\/+$/, ""), headers: { Authorization: `Bearer ${token}` } };
}

export async function testServer() {
  const { base, headers } = server();
  const h = await send(`${base}/health`);
  if (!h.ok) throw new Error(`The server answered ${h.status}.`);
  const l = await send(`${base}/backups`, { headers });
  if (l.status === 401) throw new Error("The server refused the token.");
  if (!l.ok) throw new Error(`The server answered ${l.status}.`);
  return "Connected.";
}

export async function backupNow(what = desk().backup.what) {
  const s = desk();
  const b = s.backup;
  const { base, headers } = server();
  const pass = s.env[b.passName] ?? "";
  const mustEncrypt = b.includeKeys || b.encrypt;
  if (mustEncrypt && !pass) throw new Error(`Encryption needs a passphrase (Keys → ${b.passName}).`);
  let body = payload(what, b.includeKeys);
  if (mustEncrypt) body = await encrypt(body, pass);
  const bytes = enc.encode(body);
  const sum = hex(await crypto.subtle.digest("SHA-256", bytes));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const name = `jade-vault-${what}-pandora-desktop-${stamp}${mustEncrypt ? "-enc" : ""}.json`;
  const r = await send(`${base}/backups/${name}`, { method: "PUT", headers: { ...headers, "Content-Type": "application/json", "X-Sha256": sum }, body: bytes });
  if (!r.ok) {
    let why = "";
    try {
      why = ((await r.json()) as { error?: string }).error ?? "";
    } catch {
      /* none */
    }
    throw new Error(`The server answered ${r.status}${why ? `: ${why}` : ""}.`);
  }
  s.set({ backup: { ...desk().backup, last: Date.now(), lastError: "", retryAt: 0 } });
  return `Backed up as ${name} (${Math.round(bytes.length / 1024)} KB${mustEncrypt ? ", encrypted" : ""}).`;
}

export type RemoteBackup = { name: string; size: number; modified?: number | string };

export async function listBackups(): Promise<RemoteBackup[]> {
  const { base, headers } = server();
  const r = await send(`${base}/backups`, { headers });
  if (!r.ok) throw new Error(`The server answered ${r.status}.`);
  return (((await r.json()) as { backups?: RemoteBackup[] }).backups ?? []).filter((x) => x.name.includes("pandora-desktop"));
}

/** Download and apply a backup. Only the person can do this; the characters can't. */
export async function restore(name: string, typed = "") {
  const s = desk();
  const { base, headers } = server();
  const r = await send(`${base}/backups/${encodeURIComponent(name)}`, { headers });
  if (!r.ok) throw new Error(`The server answered ${r.status}.`);
  let text = await r.text();
  const first = JSON.parse(text) as { enc?: string; salt: string; iv: string; data: string };
  if (first.enc) {
    const pass = typed || (s.env[s.backup.passName] ?? "");
    if (!pass) throw new Error("This backup is locked with a passphrase. Type it in the restore box.");
    try {
      text = await decrypt(first, pass);
    } catch {
      throw new Error("The passphrase doesn't open this backup.");
    }
  }
  const d = JSON.parse(text) as Record<string, unknown>;
  if (d.format !== "pandora-dee-desktop") throw new Error("That isn't a desktop backup.");
  const keep = ["custom", "files", "charPrefs", "model", "mcp", "bridges", "privacy", "voice", "hang", "dock", "keys", "web", "members", "messages", "inbox", "sshHosts"] as const;
  const patch: Record<string, unknown> = {};
  for (const k of keep) if (d[k] !== undefined) patch[k] = d[k];
  if (d.env && typeof d.env === "object") patch.env = { ...s.env, ...(d.env as Record<string, string>) };
  else patch.env = { ...Object.fromEntries(((d.envNames as string[]) ?? []).map((n) => [n, ""])), ...s.env };
  s.set(patch);
  return `Restored ${name}.`;
}

let backoff = 15 * 60_000;

/** Runs from the desktop: backs up when due, retrying after failures (15 minutes, doubling to 6 hours). */
export function startBackupSchedule() {
  const tick = async () => {
    const s = desk();
    const b = s.backup;
    if (!b.on || !b.url || !allowed(s.privacy, "backup")) return;
    const due = Date.now() - b.last >= b.everyHours * 3600_000;
    if (!due || (b.retryAt && Date.now() < b.retryAt)) return;
    try {
      const msg = await backupNow();
      s.log(`Backup: ${msg}`);
      backoff = 15 * 60_000;
    } catch (e) {
      const wait = backoff;
      backoff = Math.min(6 * 3600_000, backoff * 2);
      s.set({ backup: { ...desk().backup, lastError: e instanceof Error ? e.message : String(e), retryAt: Date.now() + wait } });
      s.log(`Backup failed: ${e instanceof Error ? e.message : e}. Trying again in ${Math.round(wait / 60_000)} minutes.`);
    }
  };
  void tick();
  return window.setInterval(() => void tick(), 60_000);
}

/** The backup tool: the characters can check and start a backup, never restore. */
export async function backupTool(a: Record<string, unknown>) {
  const s = desk();
  const act = String(a.action ?? "status");
  if (act === "status") {
    const b = s.backup;
    return JSON.stringify({ on: b.on, server: b.url || null, every_hours: b.everyHours, what: b.what, encrypted: b.encrypt || b.includeKeys, last: b.last ? new Date(b.last).toISOString() : null, last_error: b.lastError || null }, null, 1);
  }
  if (act === "now") return backupNow();
  if (act === "list") return JSON.stringify(await listBackups(), null, 1);
  throw new Error("The backup tool can do status, now and list. Restoring is only for the person, in Settings.");
}
