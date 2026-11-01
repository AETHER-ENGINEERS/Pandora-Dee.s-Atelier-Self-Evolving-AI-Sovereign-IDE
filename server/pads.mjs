// PADS: Pandora's Atelier's Distributed Systems. Every SEASIDE signed into an account, on a device whose person
// switched PADS on there, reports in: its name, what kind of device it is, its screen, and what's on it (its open
// windows, as a miniature). The PADS Manager shows them all and keeps how they're arranged (where each device sits in
// the room), per account. Devices that stop reporting show as away; nothing is kept about them beyond their card.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const AWAY_MS = 25_000; // a device that hasn't reported for this long is away (its page closed, or asleep)
const KINDS = new Set(["phone", "tablet", "laptop", "desktop", "mac", "console", "tv", "handheld", "other"]);

const clip = (s, n) => String(s ?? "").slice(0, n);
const num = (v, lo, hi, d = 0) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);

export function createPads({ dataDir }) {
  const dir = () => path.join(dataDir(), "pads");
  const fileOf = (account) => path.join(dir(), `${crypto.createHash("sha256").update(String(account || "").toLowerCase()).digest("hex").slice(0, 24)}.json`);
  /** account → { devices: { id → card }, layout: { id → { x, y } } } kept on disk; live state in memory */
  const live = new Map(); // device id → { at, state }

  function read(account) {
    try {
      const j = JSON.parse(fs.readFileSync(fileOf(account), "utf8"));
      return { devices: j.devices ?? {}, layout: j.layout ?? {} };
    } catch {
      return { devices: {}, layout: {} };
    }
  }
  function write(account, data) {
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(`${fileOf(account)}.tmp`, JSON.stringify(data, null, 1));
    fs.renameSync(`${fileOf(account)}.tmp`, fileOf(account));
  }

  /** A device reports in (every few seconds while PADS is on there). Returns the account's roster. */
  function hello(b) {
    const id = clip(b.id, 40);
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) throw Object.assign(new Error("Which device?"), { status: 400 });
    const account = clip(b.account, 80);
    const data = read(account);
    const card = {
      id,
      name: clip(b.name, 60) || "A device",
      kind: KINDS.has(b.kind) ? b.kind : "other",
      screen: { w: num(b.screen?.w, 200, 10000, 1280), h: num(b.screen?.h, 200, 10000, 800), dpr: num(b.screen?.dpr, 0.5, 5, 1) },
      browser: clip(b.browser, 40),
      since: data.devices[id]?.since ?? Date.now(),
    };
    const before = data.devices[id];
    // written when the card changes, a new device arrives, or a minute has passed (so "last seen" stays roughly true)
    let changed = !before || before.name !== card.name || before.kind !== card.kind || before.browser !== card.browser || JSON.stringify(before.screen) !== JSON.stringify(card.screen) || Date.now() - (before.seen ?? 0) > 60_000;
    data.devices[id] = { ...card, seen: changed ? Date.now() : before.seen };
    // a new device gets a place to the right of the others
    if (!data.layout[id]) {
      const xs = Object.values(data.layout).map((p) => p.x + 320);
      data.layout[id] = { x: xs.length ? Math.max(...xs) : 0, y: 0 };
      changed = true;
    }
    if (changed) write(account, data);
    // what's on it right now: its windows (a miniature), which one is in front, Hangout or not
    const st = b.state && typeof b.state === "object" ? b.state : {};
    live.set(id, {
      at: Date.now(),
      state: {
        windows: (Array.isArray(st.windows) ? st.windows : []).slice(0, 30).map((w) => ({ app: clip(w.app, 30), title: clip(w.title, 60), x: num(w.x, -5000, 10000), y: num(w.y, -5000, 10000), w: num(w.w, 0, 10000), h: num(w.h, 0, 10000), front: Boolean(w.front), max: Boolean(w.max) })),
        hangout: Boolean(st.hangout),
        phone: Boolean(st.phone),
        playing: clip(st.playing, 80),
      },
    });
    return roster(account);
  }

  /** Everything the PADS Manager shows for an account. */
  function roster(account) {
    const data = read(account);
    const now = Date.now();
    return {
      devices: Object.values(data.devices).map((d) => {
        const l = live.get(d.id);
        return { ...d, here: Boolean(l && now - l.at < AWAY_MS), state: l?.state ?? null, layout: data.layout[d.id] ?? { x: 0, y: 0 } };
      }),
    };
  }

  /** Where each device sits in the room (the Manager's arrangement). */
  function arrange(account, positions) {
    const data = read(account);
    for (const [id, p] of Object.entries(positions ?? {})) if (data.devices[id]) data.layout[id] = { x: num(p.x, -20000, 20000), y: num(p.y, -20000, 20000) };
    write(account, data);
    return roster(account);
  }

  /** A device leaves PADS (switched off there, or removed from the Manager). */
  function forget(account, id) {
    const data = read(account);
    delete data.devices[id];
    delete data.layout[id];
    live.delete(id);
    write(account, data);
    return roster(account);
  }

  return { hello, roster, arrange, forget };
}
