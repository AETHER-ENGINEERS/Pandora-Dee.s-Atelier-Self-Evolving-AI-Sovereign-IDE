import { test } from "node:test";
import assert from "node:assert/strict";
import { addLimit, addUsage, EMPTY, spent, standing, summary, withinBudget } from "./meterCore.ts";

const H = 3_600_000;
const t0 = 1_800_000_000_000;
const u = (prompt: number, output: number, estimated = false) => ({ prompt, output, ms: 2000, estimated });

test("calls add up by hour, kind and connection, and old ones fall away", () => {
  let l = addUsage(EMPTY, t0, "heartbeat", "Ollama Cloud", u(3000, 200));
  l = addUsage(l, t0 + 60_000, "heartbeat", "Ollama Cloud", u(3100, 100));
  l = addUsage(l, t0, "reply", "Mac", u(5000, 500, true));
  assert.equal(Object.keys(l.buckets).length, 2);
  assert.equal(spent(l, t0 - H), 11_900);
  assert.equal(spent(l, t0 - H, ["heartbeat"]), 6_400);
  l = addUsage(l, t0 + 31 * 24 * H, "reply", "Mac", u(1, 1));
  assert.equal(spent(l, 0), 2, "30 days on, the old buckets are gone");
});

test("her budget covers work she starts herself, not replies", () => {
  let l = addUsage(EMPTY, t0, "reply", "Mac", u(50_000, 1000));
  assert.ok(withinBudget(l, { hourTokens: 5000 }, t0).ok, "replies don't count against it");
  l = addUsage(l, t0, "heartbeat", "Mac", u(4900, 200));
  assert.match(withinBudget(l, { hourTokens: 5000 }, t0).why, /hourly budget/);
  assert.ok(withinBudget(l, { hourTokens: 5000 }, t0 + 2 * H).ok, "the next hour starts fresh");
  assert.match(withinBudget(l, { dayTokens: 5000 }, t0 + 2 * H).why, /24-hour budget/);
  assert.ok(withinBudget(l, undefined, t0).ok, "no budget, no limit");
});

test("what she reads: totals, cost per kind of action, limits hit", () => {
  let l = addUsage(EMPTY, t0, "heartbeat", "Ollama Cloud", u(3000, 200));
  l = addUsage(l, t0, "heartbeat", "Ollama Cloud", { ...u(3000, 200), limits: { "x-ratelimit-remaining-tokens": "9000" } });
  l = addUsage(l, t0, "storybook", "Mac", u(8000, 600, true));
  l = addLimit(l, t0, "Ollama Cloud", "you've reached your hourly usage limit");
  const s = summary(l, { dayTokens: 20_000 }, t0);
  assert.match(s, /- heartbeat: 2 calls, about 3\.2k tokens and 2\.0 s each/);
  assert.match(s, /- storybook: 1 calls, about 8\.6k tokens .*1 estimated/);
  assert.match(s, /x-ratelimit-remaining-tokens 9000/);
  assert.match(s, /hourly usage limit/);
  assert.match(standing(l, { dayTokens: 20_000 }, t0), /6\.4k on work you started yourself \(14k left of your 20k daily budget\)/);
});
