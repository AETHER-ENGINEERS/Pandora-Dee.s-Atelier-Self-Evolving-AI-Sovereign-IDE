import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createVecMem } from "./vecmem.mjs";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vecmem-"));
const V = createVecMem({ dataDir: () => dir });
const char = "dee";
// tiny three-number "embeddings": cats, music, code
const E = { cat: [1, 0, 0], kitten: [0.9, 0.1, 0], song: [0, 1, 0], code: [0, 0, 1] };

test("reconcile adds, keeps and removes texts to match her files", () => {
  const want = [
    { coll: "memory", src: "MEMORY.md", head: "", text: "Mrrowr-murrr's cat knocks notes off the shelf" },
    { coll: "memory", src: "MEMORY.md", head: "", text: "Path of the Fool has my music in it" },
    { coll: "memory", src: "MEMORY.md", head: "", text: "Builds go green after restoring main.js" },
  ];
  assert.deepEqual(V.run({ op: "reconcile", char, colls: ["memory"], want }), { added: 3, removed: 0 });
  assert.deepEqual(V.run({ op: "reconcile", char, colls: ["memory"], want }), { added: 0, removed: 0 });
  assert.equal(V.run({ op: "pending", char }).length, 3);
});

test("search: keywords alone, then meaning fused in", () => {
  const ids = Object.fromEntries(V.run({ op: "pending", char }).map((r) => [r.text.includes("cat") ? "cat" : r.text.includes("music") ? "song" : "code", r.id]));
  V.run({ op: "vectors", char, model: "toy", items: Object.entries(ids).map(([k, id]) => ({ id, vec: E[k] })) });
  assert.equal(V.run({ op: "pending", char }).length, 0);

  const kw = V.run({ op: "search", char, query: "music", mode: "keyword" });
  assert.match(kw.hits[0].text, /music/);

  // "kitten" shares no words with any line, but is close in meaning to the cat line
  const sem = V.run({ op: "search", char, query: "kitten", vec: E.kitten, colls: ["memory"], k: 1 });
  assert.match(sem.hits[0].text, /cat/);
  assert.ok(sem.hits[0].distance < 0.1);
});

test("a different model's numbers are refused until the index is rebuilt", () => {
  const [id] = [...V.run({ op: "search", char, query: "cat", mode: "keyword" }).hits.map((h) => h.id)];
  assert.throws(() => V.run({ op: "vectors", char, model: "other", items: [{ id, vec: [1, 0, 0, 0] }] }), /Rebuild/);
  V.run({ op: "add", char, coll: "lore", text: "Ore is the first token" });
  V.run({ op: "rebuild", char });
  const s = V.run({ op: "status", char });
  assert.equal(s.dim, 0);
  // her own collection keeps its text; memory comes back from her files on the next sync
  assert.deepEqual(s.collections.map((c) => c.name), ["lore"]);
});

test("remove by collection", () => {
  assert.equal(V.run({ op: "remove", char, coll: "lore" }).removed, 1);
  assert.throws(() => V.run({ op: "remove", char }), /needs/);
  assert.throws(() => V.run({ op: "status", char: "../x" }), /Unknown character/);
});
