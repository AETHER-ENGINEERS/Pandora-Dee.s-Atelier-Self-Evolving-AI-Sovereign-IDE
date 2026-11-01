import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLuanti, cleanHost, cleanName } from "./luanti.mjs";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "luanti-"));
let config = {};
const spawned = [];
const L = createLuanti({
  readConfig: () => config,
  writeConfig: (p) => void (config = { ...config, ...p }),
  fetchImpl: async () => ({ ok: true, json: async () => ({ list: [{ name: "A", address: "a.example", port: 30000, clients: 2 }, { name: "Bad", address: "x; rm -rf /", port: 1 }] }) }),
  spawnImpl: (exe, args) => (spawned.push({ exe, args }), { on() {}, unref() {} }),
});

test("Cryptechtest is there from the start; servers are added, changed and removed", () => {
  assert.equal(L.status().servers[0].address, "cryptechcraft.xyz");
  L.saveServer({ name: "Home world", address: "192.168.1.20", port: 30001 });
  assert.deepEqual(L.status().servers.map((s) => s.name), ["Cryptechtest", "Home world"]);
  assert.throws(() => L.saveServer({ address: "not a host!", port: 30000 }), /doesn't look right/);
  L.removeServer("cryptechtest");
  assert.deepEqual(L.status().servers.map((s) => s.name), ["Home world"]);
});

test("the public list keeps only servers with proper addresses", async () => {
  const list = await L.publicList();
  assert.deepEqual(list.map((s) => s.name), ["A"]);
});

test("starting Luanti: the person's own program, into a server, with checked arguments", () => {
  assert.throws(() => L.launch({ address: "a.example", port: 30000, name: "Pandora" }), /isn't installed/);
  const exe = path.join(dir, "luanti.exe");
  fs.writeFileSync(exe, "");
  assert.throws(() => L.setProgram(path.join(dir, "notluanti.exe")), /isn't Luanti/);
  L.setProgram(exe);
  assert.throws(() => L.launch({ address: "a.example", port: 30000, name: "bad name!" }), /letters, numbers/);
  L.launch({ address: "cryptechcraft.xyz", port: 30000, name: "Technomancer" });
  assert.deepEqual(spawned.at(-1), { exe, args: ["--address", "cryptechcraft.xyz", "--port", "30000", "--name", "Technomancer", "--go"] });
  L.launch({});
  assert.deepEqual(spawned.at(-1).args, []);
  assert.equal(cleanHost("--help"), "");
  assert.equal(cleanName("x".repeat(21)), "");
});
