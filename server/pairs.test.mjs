import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPairs } from "./pairs.mjs";

const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pairs-")), "classic-pairs.json");
const P = createPairs({ file: () => file });
const asked = (token, origin = "http://localhost:18099") => ({ headers: { authorization: `Bearer ${token}`, origin } });

test("a pairing's token works, is kept only as a fingerprint, and stops working when removed", () => {
  const made = P.add("Pandora on the laptop");
  assert.match(made.token, /^pdd_[A-Za-z0-9_-]{43}$/);
  // the file never holds the token itself
  assert.ok(!fs.readFileSync(file, "utf8").includes(made.token));
  assert.deepEqual(P.check(asked(made.token)), { id: made.id, name: "Pandora on the laptop" });
  // the list shows names and use, never tokens or fingerprints
  const [row] = P.list();
  assert.equal(row.name, "Pandora on the laptop");
  assert.equal(row.origin, "http://localhost:18099");
  assert.ok(row.used > 0);
  assert.ok(!("hash" in row) && !("token" in row));
  // wrong, malformed and missing tokens are refused
  assert.equal(P.check(asked(made.token.slice(0, -1) + (made.token.endsWith("A") ? "B" : "A"))), null);
  assert.equal(P.check(asked("not-a-token")), null);
  assert.equal(P.check({ headers: {} }), null);
  assert.deepEqual(P.remove(made.id), { removed: 1 });
  assert.equal(P.check(asked(made.token)), null);
});
