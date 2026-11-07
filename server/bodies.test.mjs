import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createBodies } from "./bodies.mjs";

const setup = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "pdd-bodies-"));
  return { d, b: createBodies({ dataDir: () => d }) };
};

test("her files land in Classic's layout, and the mirror keeps it exact", () => {
  const { d, b } = setup();
  b.write("dee", { "/Pandora/SOUL.md": "# Pandora Dee", "/agents.md": "# AGENTS", "/Pandora/Journal/2026-11-07.md": "a day" });
  const dir = path.join(d, "bodies", "dee");
  assert.equal(fs.readFileSync(path.join(dir, "Pandora", "SOUL.md"), "utf8"), "# Pandora Dee");
  b.write("dee", { "/Pandora/SOUL.md": "# Pandora Dee", "/agents.md": "# AGENTS" });
  assert.ok(!fs.existsSync(path.join(dir, "Pandora", "Journal", "2026-11-07.md")), "a file she no longer has goes");
  assert.deepEqual(b.read("dee").changed, [], "nothing changed elsewhere yet");
});

test("what another body changed or added is noticed", async () => {
  const { d, b } = setup();
  b.write("dee", { "/Pandora/SOUL.md": "# Pandora Dee", "/Pandora/Memory.md": "# Memory" });
  await new Promise((r) => setTimeout(r, 30));
  const dir = path.join(d, "bodies", "dee");
  fs.writeFileSync(path.join(dir, "Pandora", "Memory.md"), "# Memory\n- learned on the phone");
  fs.mkdirSync(path.join(dir, "Pandora", "Journal"), { recursive: true });
  fs.writeFileSync(path.join(dir, "Pandora", "Journal", "phone.md"), "from the phone");
  const r = b.read("dee");
  assert.deepEqual(r.changed.sort(), ["/Pandora/Journal/phone.md", "/Pandora/Memory.md"]);
  assert.equal(r.files["/Pandora/Memory.md"], "# Memory\n- learned on the phone");
});

test("nothing climbs out of her folder", () => {
  const { b } = setup();
  assert.throws(() => b.write("dee", { "/../../evil.md": "x" }), /isn't inside her folder/);
  assert.throws(() => b.write("../x", {}), /character id/);
});
