import { test } from "node:test";
import assert from "node:assert/strict";
import { bookFor, bookHeader, parseScene, redactKeys, sceneText } from "./storybook.ts";

test("a branch keeps its book when renamed; same titles get their own", () => {
  const files = { "storybook/Mode shrine.md": `${bookHeader("Mode shrine", "the Room", "<!-- branch: a1 -->")}` };
  assert.equal(bookFor(files, { id: "a1", title: "Renamed" }).path, "storybook/Mode shrine.md");
  assert.equal(bookFor(files, { id: "b2", title: "Mode shrine" }).path, "storybook/Mode shrine (2).md");
  assert.equal(bookFor({}, { id: "c3", title: "a/b: c?" }).path, "storybook/ab c.md");
});

test("scenes: two voices, nothing new, and other shapes", () => {
  assert.deepEqual(parseScene("<think>hm</think>IN THE ROOM:\nWe fixed it.\n\nINSIDE:\nI was proud.\n\nREMEMBER:\n- x"), { room: "We fixed it.", inside: "I was proud." });
  assert.equal(parseScene("NOTHING NEW"), null);
  assert.equal(parseScene("just chatting"), null);
  assert.match(sceneText(new Date("2026-11-07T10:20:30.456Z"), { room: "a", inside: "b" }), /^\n## 2026-11-07T10:20:30Z\n\n### In the room\na\n\n### Inside\nb\n$/);
});

test("saved keys never reach a book", () => {
  assert.equal(redactKeys("my key is nsec1secret and abcd", { VECTOR_NSEC: "nsec1secret", SHORT: "abcd" }), "my key is {{VECTOR_NSEC}} and {{SHORT}}");
  assert.equal(redactKeys("a b c", { TINY: "b" }), "a b c", "values under four characters are too common to swap");
});
