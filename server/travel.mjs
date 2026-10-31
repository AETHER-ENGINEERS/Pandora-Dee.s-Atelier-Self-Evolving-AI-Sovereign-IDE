// Accounts that travel between devices: for each account switched to travel, the desktop as that account last left
// it (characters, settings, windows; never Keys or passcodes, which stay on each device) is kept here, so signing in
// on the phone or the Mac finds it. Kept unencrypted in the data folder for now (the person's choice, 10-30): this is
// the local server on their own network; passcode encryption comes with peer-to-peer later, as an option.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function createTravel(dataDir) {
  const dir = () => path.join(dataDir(), "accounts");
  // a file name from the account name that any file system takes, and that can't step outside the folder
  const fileOf = (name) => path.join(dir(), `${crypto.createHash("sha256").update(String(name).toLowerCase()).digest("hex").slice(0, 24)}.json`);
  const err = (status, message) => Object.assign(new Error(message), { status });

  function read(name) {
    try {
      return JSON.parse(fs.readFileSync(fileOf(name), "utf8"));
    } catch {
      return null;
    }
  }

  /** Who travels: names, pictures and when they were last saved (never their desktops). */
  function list() {
    let names = [];
    try {
      names = fs.readdirSync(dir()).filter((f) => f.endsWith(".json"));
    } catch {
      return [];
    }
    const out = [];
    for (const f of names) {
      try {
        const r = JSON.parse(fs.readFileSync(path.join(dir(), f), "utf8"));
        out.push({ name: r.account.name, picture: r.account.picture || "", role: r.account.role, password: Boolean(r.account.sealed), at: r.at, device: r.device });
      } catch {
        /* a half-written or foreign file: skipped */
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** One account's record: the account (with its password's salted hash, never the password) and its desktop. */
  function get(name) {
    const r = read(name);
    if (!r) throw err(404, "That account doesn't travel (or isn't kept here any more).");
    return r;
  }

  function put(name, body) {
    const account = body?.account;
    if (!account || typeof account.name !== "string" || account.name !== name) throw err(400, "The account doesn't match.");
    if (!body.state || typeof body.state !== "object") throw err(400, "Nothing to keep.");
    const at = Date.now();
    fs.mkdirSync(dir(), { recursive: true });
    const tmp = `${fileOf(name)}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ account, state: body.state, device: String(body.device || "").slice(0, 80), at }));
    fs.renameSync(tmp, fileOf(name));
    return { at };
  }

  function stop(name) {
    try {
      fs.unlinkSync(fileOf(name));
    } catch {
      /* already gone */
    }
    return { ok: true };
  }

  return { list, get, put, stop };
}
