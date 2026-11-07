import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CLOSED_MS, createHeart } from "./heart.mjs";

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pdd-heart-"));
  let t = 1_000_000;
  const launched = [];
  const h = createHeart({
    dataDir: () => dir,
    seal: (o) => `SEALED${JSON.stringify(o)}`,
    open: (s) => JSON.parse(s.replace(/^SEALED/, "")),
    launch: async (url) => {
      const k = { url, closed: false };
      launched.push(k);
      return { close: () => (k.closed = true) };
    },
    now: () => t,
  });
  return { h, dir, launched, advance: (ms) => (t += ms) };
}

test("one heart: the desktop on this computer first, then the keeper, then the first other page", () => {
  const { h, advance } = setup();
  assert.equal(h.beat("phone", { onPc: false }).hold, true, "alone, a phone holds it");
  assert.equal(h.beat("desk", { onPc: true, port: 15693 }).hold, true, "the desktop here takes it");
  assert.equal(h.beat("phone", { onPc: false }).hold, false);
  assert.equal(h.beat("fake", { onPc: false, keeper: true }).hold, false, "a keeper flag from elsewhere isn't trusted");
  advance(30_000);
  assert.equal(h.beat("phone", { onPc: false }).hold, true, "the desktop went quiet: the phone takes over");
});

test("keep them running: the keeper opens a minute after the desktop closes, and hands everything back", async () => {
  const { h, dir, launched, advance } = setup();
  h.setConfig({ keep: true });
  h.beat("desk", { onPc: true, port: 15693 });
  assert.deepEqual(h.put("desk", "STATE-1", false), { ok: true });
  assert.ok(fs.readFileSync(path.join(dir, "heart", "state.sealed"), "utf8").startsWith("SEALED"));
  await h.tick();
  assert.equal(launched.length, 0, "the desktop is open");
  advance(CLOSED_MS + 1000);
  await h.tick();
  assert.equal(launched.length, 1);
  assert.equal(launched[0].url, "http://localhost:15693/?keeper=1");
  assert.deepEqual(await h.get({ forKeeper: true }), { fresh: true, savedAt: 1_000_000, blob: "STATE-1" });
  assert.equal(h.beat("keeper", { onPc: true, keeper: true }).hold, true, "the keeper holds the heart");
  assert.equal(h.put("keeper", "STATE-2", false).ok, true);

  // the desktop comes back: it waits while the keeper saves and steps down
  const back = h.get({ since: 0 });
  h.beat("desk", { onPc: true, port: 15693 });
  assert.equal(h.beat("keeper", { onPc: true, keeper: true }).handBack, true);
  assert.equal(h.put("keeper", "STATE-3", true).ok, true);
  const got = await back;
  assert.equal(got.fresh, true);
  assert.equal(got.blob, "STATE-3");
  assert.equal(launched[0].closed, true, "the keeper closed");
  assert.deepEqual(await h.get({ since: got.savedAt }), { fresh: false }, "taken once, not again");
});

test("off means no keeper, and switching off closes one", async () => {
  const { h, launched, advance } = setup();
  h.beat("desk", { onPc: true, port: 15693 });
  assert.equal(h.put("desk", "S", false).ok, false, "nothing is copied while off");
  h.setConfig({ keep: true });
  h.put("desk", "S", false);
  advance(CLOSED_MS + 1000);
  await h.tick();
  assert.equal(launched.length, 1);
  h.setConfig({ keep: false });
  assert.equal(launched[0].closed, true);
});

test("a page that leaves lets go at once; a reloaded page takes the heart straight away", () => {
  const { h } = setup();
  h.beat("old", { onPc: true, port: 1 });
  assert.equal(h.beat("new", { onPc: true, port: 1 }).hold, false, "the old page still holds it");
  h.leave("old");
  assert.equal(h.beat("new", { onPc: true, port: 1 }).hold, true);
});

test("a page that doesn't hold the heart can't overwrite the copy", () => {
  const { h } = setup();
  h.setConfig({ keep: true });
  h.beat("desk", { onPc: true, port: 1 });
  h.beat("phone", { onPc: false });
  assert.deepEqual(h.put("phone", "X", false), { ok: false, why: "not the heart" });
});
