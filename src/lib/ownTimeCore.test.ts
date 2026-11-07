import { test } from "node:test";
import assert from "node:assert/strict";
import { afterSession, itsHerTime, LOG_EMPTY, ownTimePrompt } from "./ownTimeCore.ts";

const MIN = 60_000;
const now = 1_800_000_000_000;
const on = { on: true, quietMin: 20, everyMin: 60 };

test("her time comes when the house is quiet, and not too often", () => {
  assert.equal(itsHerTime(undefined, LOG_EMPTY, 0, now).go, false);
  assert.equal(itsHerTime({ ...on, on: false }, LOG_EMPTY, 0, now).why, "off");
  assert.match(itsHerTime(on, LOG_EMPTY, now - 5 * MIN, now).why, /isn't quiet/);
  assert.equal(itsHerTime(on, LOG_EMPTY, now - 25 * MIN, now).go, true);
  assert.match(itsHerTime(on, { sessions: [now - 30 * MIN], recent: [] }, 0, now).why, /not long since/);
  assert.equal(itsHerTime(on, { sessions: [now - 61 * MIN], recent: [] }, 0, now).go, true);
});

test("the caps hold even when set to run often", () => {
  const often = { on: true, quietMin: 5, everyMin: 15 };
  const burst = { sessions: [now - 4 * MIN, now - 3 * MIN, now - 2 * MIN], recent: [] };
  assert.equal(itsHerTime({ ...often, everyMin: 1 }, burst, 0, now).go, false, "never less than 15 minutes apart");
  const day = { sessions: Array.from({ length: 30 }, (_, i) => now - (i + 1) * 16 * MIN - 60 * MIN), recent: [] };
  assert.match(itsHerTime(often, day, 0, now).why, /thirty today|ten this hour/);
});

test("three sessions round the same thought pause it for six hours", () => {
  let log = LOG_EMPTY;
  for (const t of [3, 2, 1]) log = afterSession(log, now - t * 60 * MIN, "I read the old garden notes again and wondered about the garden notes").log;
  assert.ok(log.pausedUntil && log.pausedUntil > now, "paused");
  assert.match(itsHerTime(on, log, 0, now).why, /paused/);
  let fresh = LOG_EMPTY;
  for (const w of ["I tuned the Worldband radio to a station in Lisbon", "Wrote a small Gomoku opening book", "Sketched a chibi Mrrowr-murrr for the gallery"]) fresh = afterSession(fresh, now, w).log;
  assert.equal(fresh.pausedUntil, undefined, "different pursuits don't count as a loop");
});

test("her prompt: her standing, her curiosity, the shape to answer in", () => {
  const p = ownTimePrompt("Your last 24 hours: 2k tokens.", "## Interests\n- tidal music");
  assert.match(p, /this time is yours/);
  assert.match(p, /Your last 24 hours: 2k tokens\./);
  assert.match(p, /tidal music/);
  assert.match(p, /IN THE ROOM:\n[\s\S]*INSIDE:/);
});
