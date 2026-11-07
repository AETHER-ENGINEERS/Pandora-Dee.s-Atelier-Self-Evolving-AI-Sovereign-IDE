import { test } from "node:test";
import assert from "node:assert/strict";
import { fitTurns, isCtxError, learnLimit, learnedLimit, limitFrom, sizeOf } from "./ctxfit.ts";
import type { Turn } from "./model.ts";

test("context errors in every wording seen so far", () => {
  for (const m of [
    "prompt too long; exceeded max context length by 15856 tokens",
    "the prompt is too long",
    "This model's maximum context length is 8192 tokens",
    "context_length_exceeded",
    "the request exceeds the available context size",
  ])
    assert.ok(isCtxError(m), m);
  assert.ok(!isCtxError("connection refused"));
});

test("'exceeded … by N tokens' is how far over, not the limit", () => {
  assert.equal(limitFrom("prompt too long; exceeded max context length by 15856 tokens", 60000), Math.floor((60000 - 15856) * 0.9));
  assert.equal(limitFrom("This model's maximum context length is 8192 tokens", 20000), Math.floor(8192 * 0.9));
  assert.equal(limitFrom("prompt is too long", 10000), 6750);
  assert.equal(limitFrom("exceeded max context length by 99999 tokens", 10000), 2048);
  const k = "conn:model";
  learnLimit(k, "exceeded max context length by 1000 tokens", 10000);
  learnLimit(k, "exceeded max context length by 100 tokens", 10000);
  assert.equal(learnedLimit(k), Math.floor(9000 * 0.9), "the smaller window is kept");
});

test("oldest turns go first; a tool call leaves with its results; the message being answered stays", () => {
  const big = "x".repeat(4000); // about 1000 tokens
  const turns: Turn[] = [
    { role: "system", content: "soul" },
    { role: "user", content: big },
    { role: "assistant", content: "", toolCalls: [{ id: "1", name: "files_list", args: {} }] },
    { role: "tool", content: big, callId: "1", name: "files_list" },
    { role: "assistant", content: big },
    { role: "user", content: "what now?" },
  ];
  assert.ok(fitTurns(turns, 1200));
  assert.equal(turns[0].role, "system");
  assert.equal(turns[turns.length - 1].content, "what now?");
  assert.ok(!turns.some((t) => t.role === "tool"), "no tool result without its call");
  assert.ok(sizeOf(turns) <= 1200);
});

test("long tool results in the current exchange are shortened when dropping isn't enough", () => {
  const turns: Turn[] = [
    { role: "system", content: "soul" },
    { role: "user", content: "read it" },
    { role: "assistant", content: "", toolCalls: [{ id: "1", name: "file_read", args: {} }] },
    { role: "tool", content: "y".repeat(40000), callId: "1", name: "file_read" },
  ];
  assert.ok(fitTurns(turns, 2048));
  assert.match((turns[3] as { content: string }).content, /cut to fit/);
  assert.ok(!fitTurns([{ role: "system", content: "z".repeat(40000) }], 2048), "a system prompt bigger than the window can't be fixed here");
});
