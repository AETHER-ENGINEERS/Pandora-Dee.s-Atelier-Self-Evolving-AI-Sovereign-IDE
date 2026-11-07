import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createResidentKeys, seal, unseal } from "./residentKeys.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "pdd-res-"));

test("sealed files hold her keys and nothing readable", () => {
  const dir = tmp();
  const rk = createResidentKeys({ dataDir: () => dir, master: crypto.randomBytes(32) });
  assert.deepEqual(rk.set("dee", "VECTOR_NSEC", "nsec1example"), ["VECTOR_NSEC"]);
  rk.set("dee", "DMD_WALLET", "wallet-secret");
  rk.set("jade", "GROQ_API_KEY", "gsk-example");
  const raw = fs.readFileSync(path.join(dir, "residents", "dee.keys"), "utf8");
  assert.ok(!raw.includes("nsec1example") && !raw.includes("wallet-secret"));
  assert.deepEqual(rk.values("dee"), { VECTOR_NSEC: "nsec1example", DMD_WALLET: "wallet-secret" });
  assert.deepEqual(rk.names(), { dee: ["DMD_WALLET", "VECTOR_NSEC"], jade: ["GROQ_API_KEY"] });
  rk.set("dee", "DMD_WALLET", "");
  assert.deepEqual(rk.names().dee, ["VECTOR_NSEC"]);
  rk.set("jade", "GROQ_API_KEY", "");
  assert.ok(!fs.existsSync(path.join(dir, "residents", "jade.keys")), "an empty vault leaves no file");
});

test("another master key can't open them; bad ids and names are refused", () => {
  const k = crypto.randomBytes(32);
  const box = seal(k, { A: "1" });
  assert.deepEqual(unseal(k, box), { A: "1" });
  assert.throws(() => unseal(crypto.randomBytes(32), box));
  const rk = createResidentKeys({ dataDir: tmp, master: k });
  assert.throws(() => rk.set("../etc", "A", "x"), /character id/);
  assert.throws(() => rk.set("dee", "lower", "x"), /capital letters/);
});
