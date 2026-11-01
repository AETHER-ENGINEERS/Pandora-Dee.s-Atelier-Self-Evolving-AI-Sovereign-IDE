import test from "node:test";
import assert from "node:assert/strict";
import { pbkdf2Sync } from "node:crypto";
import { pbkdf2Sha256 } from "./pbkdf2.ts";

const enc = (s: string) => new TextEncoder().encode(s);
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

test("plain-JavaScript PBKDF2 gives exactly what the browser's own (and Node's) gives", async () => {
  // RFC 7914's published PBKDF2-HMAC-SHA-256 vector
  assert.equal(hex(await pbkdf2Sha256(enc("passwd"), enc("salt"), 1)), "55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc");
  // passcodes as secure.ts seals them: a 32-character hex salt, 120,000 rounds; long keys and odd characters too
  for (const pass of ["1234", "correct horse battery staple", "pässcödé 🧸", "x".repeat(100)]) {
    const salt = "0123456789abcdef0123456789abcdef";
    assert.equal(hex(await pbkdf2Sha256(enc(pass), enc(salt), 120_000)), pbkdf2Sync(pass, salt, 120_000, 32, "sha256").toString("hex"), pass);
  }
});
