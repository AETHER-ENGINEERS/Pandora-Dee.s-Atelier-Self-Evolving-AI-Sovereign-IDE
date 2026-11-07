// Each character's own keys (the resident vault): her nsec, her API keys, her wallet. Keys belong to the resident,
// not to the desktop. One file per character in the data folder's residents/ folder, sealed with AES-256-GCM under a
// master key the operating system guards: Windows' DPAPI for this user, the login Keychain on a Mac, elsewhere a
// file only this user can read. That stops someone who copies the folder to another machine or account; it can't
// stop software already running as you, the same as a browser profile. They never go in backups.
//
// The plugin hands values only to the desktop page on this computer (or over Tailscale's https); other pages see names.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

export const RESIDENT_ID = /^[\w-]{1,64}$/;
export const KEY_NAME = /^[A-Z0-9_]{1,64}$/;
const SERVICE = "PDA SEASIDE residents";

/** Windows: DPAPI for the signed-in user, through Windows PowerShell. The value travels in an environment variable, not the command line. */
function dpapi(op, b64) {
  const ps = `Add-Type -AssemblyName System.Security; [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::${op}([Convert]::FromBase64String($env:PDD_IN), $null, 'CurrentUser'))`;
  return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { env: { ...process.env, PDD_IN: b64 }, windowsHide: true }).toString().trim();
}

/** The master key: made once, kept where the system guards it. */
function systemMaster(dir) {
  fs.mkdirSync(dir, { recursive: true });
  if (process.platform === "win32") {
    const f = path.join(dir, "master.dpapi");
    if (fs.existsSync(f)) return Buffer.from(dpapi("Unprotect", fs.readFileSync(f, "utf8").trim()), "base64");
    const k = crypto.randomBytes(32);
    fs.writeFileSync(f, dpapi("Protect", k.toString("base64")));
    return k;
  }
  if (process.platform === "darwin") {
    try {
      return Buffer.from(execFileSync("security", ["find-generic-password", "-s", SERVICE, "-a", "master", "-w"]).toString().trim(), "base64");
    } catch {
      const k = crypto.randomBytes(32);
      execFileSync("security", ["add-generic-password", "-s", SERVICE, "-a", "master", "-w", k.toString("base64")]);
      return k;
    }
  }
  const f = path.join(dir, "master.key");
  if (fs.existsSync(f)) return Buffer.from(fs.readFileSync(f, "utf8").trim(), "base64");
  const k = crypto.randomBytes(32);
  fs.writeFileSync(f, k.toString("base64"), { mode: 0o600 });
  return k;
}

export function seal(key, obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), data: data.toString("base64") });
}

export function unseal(key, text) {
  const j = JSON.parse(text);
  const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(j.iv, "base64"));
  d.setAuthTag(Buffer.from(j.tag, "base64"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(j.data, "base64")), d.final()]).toString("utf8"));
}

/** `master` is for tests; normally the system's guarded key is used. */
export function createResidentKeys({ dataDir, master }) {
  const dir = () => path.join(dataDir(), "residents");
  let key = master ?? null;
  const masterKey = () => (key ??= systemMaster(dir()));
  const fileOf = (id) => {
    if (!RESIDENT_ID.test(id)) throw Object.assign(new Error("That isn't a character id."), { status: 400 });
    return path.join(dir(), `${id}.keys`);
  };
  const read = (id) => {
    const f = fileOf(id);
    return fs.existsSync(f) ? unseal(masterKey(), fs.readFileSync(f, "utf8")) : {};
  };

  return {
    /** Seal and open anything else that holds keys (the heart's copy of the desktop) under the same master key. */
    seal: (obj) => seal(masterKey(), obj),
    open: (text) => unseal(masterKey(), text),
    /** Every character's key names (no values). */
    names() {
      if (!fs.existsSync(dir())) return {};
      const out = {};
      for (const f of fs.readdirSync(dir())) {
        const id = f.replace(/\.keys$/, "");
        if (f.endsWith(".keys") && RESIDENT_ID.test(id)) out[id] = Object.keys(read(id)).sort();
      }
      return out;
    },
    values: (id) => read(id),
    /** Set a key, or remove it with an empty value. */
    set(id, name, value) {
      if (!KEY_NAME.test(name)) throw Object.assign(new Error("Key names are capital letters, digits and _."), { status: 400 });
      const all = read(id);
      if (value) all[name] = String(value);
      else delete all[name];
      fs.mkdirSync(dir(), { recursive: true });
      const f = fileOf(id);
      if (Object.keys(all).length) fs.writeFileSync(f, seal(masterKey(), all), { mode: 0o600 });
      else fs.rmSync(f, { force: true });
      return Object.keys(all).sort();
    },
  };
}
