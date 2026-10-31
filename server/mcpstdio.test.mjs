import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMcpStdio } from "./mcpstdio.mjs";

// a tiny program server: answers initialize, and echo with the env value it was started with
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcpstdio-"));
const prog = path.join(dir, "echo.mjs");
fs.writeFileSync(
  prog,
  `import readline from "node:readline";
console.error("ready");
readline.createInterface({ input: process.stdin }).on("line", (l) => {
  const m = JSON.parse(l);
  if (m.id == null) return;
  const result = m.method === "initialize" ? { serverInfo: { name: "echo" } } : { text: m.params.text + " " + process.env.SECRET };
  process.stdout.write("not a message\\n" + JSON.stringify({ jsonrpc: "2.0", id: m.id, result }) + "\\n");
});`,
);

test("a program server starts, answers by id, and stops", async () => {
  const S = createMcpStdio();
  S.start({ id: "fae--echo", command: process.execPath, args: [prog], env: { SECRET: "shh" } });
  const a = await S.send("fae--echo", { jsonrpc: "2.0", id: 1, method: "initialize" });
  assert.equal(a.result.serverInfo.name, "echo");
  const [b, c] = await Promise.all([
    S.send("fae--echo", { jsonrpc: "2.0", id: 2, method: "x", params: { text: "two" } }),
    S.send("fae--echo", { jsonrpc: "2.0", id: 3, method: "x", params: { text: "three" } }),
  ]);
  assert.equal(b.result.text, "two shh");
  assert.equal(c.result.text, "three shh");
  assert.equal(await S.send("fae--echo", { jsonrpc: "2.0", method: "notifications/initialized" }), null);
  // what it printed that wasn't a message, and its error output, are kept to show
  assert.ok(S.status("fae--echo").log.includes("ready"));
  assert.ok(S.status("fae--echo").log.includes("not a message"));
  assert.equal(S.stop("fae--echo"), true);
  assert.throws(() => S.send("fae--echo", { jsonrpc: "2.0", id: 4, method: "x" }), /isn't running/);
  assert.throws(() => S.start({ id: "../x", command: "node" }), /Unknown server/);
});
