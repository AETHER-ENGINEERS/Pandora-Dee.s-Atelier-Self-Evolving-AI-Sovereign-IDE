import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import { createLuantiWeb } from "./luantiWeb.mjs";

const zip = Buffer.from(zipSync({ "index.html": strToU8("<html>theirs</html>"), "a1b2c3d4e5f6/launcher.js": strToU8("// launcher"), "a1b2c3d4e5f6/luanti.wasm": new Uint8Array([0, 97, 115, 109]) }));
const sha = crypto.createHash("sha256").update(zip).digest("hex");

function fakeGitHub(sum) {
  return async (url) => {
    if (url.includes("/releases?")) return { ok: true, json: async () => [{ tag_name: "luanti-web-5bfae52", created_at: "2026-11-01T00:00:00Z", draft: false, assets: [{ name: "luanti-web.zip", size: zip.length, browser_download_url: "zip", digest: `sha256:${sha}` }, { name: "luanti-web.zip.sha256", browser_download_url: "sum" }] }] };
    if (url === "sum") return { ok: true, text: async () => `${sum}\n` };
    if (url === "zip") return { ok: true, body: (async function* () { yield zip.subarray(0, 10); yield zip.subarray(10); })() };
    throw new Error(url);
  };
}
function fakeRes() {
  const r = { headers: {}, statusCode: 0, body: "", setHeader: (k, v) => (r.headers[k.toLowerCase()] = v) };
  return r;
}
const send = (res, code, body, type) => ((res.statusCode = code), (res.body = body), (res.type = type));

test("the build is used only when it matches its checksum, and is served cross-origin isolated", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lweb-"));
  const bad = createLuantiWeb({ dataDir: () => dir, fetchImpl: fakeGitHub("0".repeat(64)) });
  await assert.rejects(bad.install(), /checksum/);
  assert.equal(bad.status().installed, null);

  const W = createLuantiWeb({ dataDir: () => dir, fetchImpl: fakeGitHub(sha) });
  const st = await W.install();
  assert.equal(st.installed.release, "a1b2c3d4e5f6");
  assert.equal(st.installed.sha256, sha);

  let res = fakeRes();
  W.serve({}, res, new URL("http://x/luanti-web/play"), send);
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /src="a1b2c3d4e5f6\/launcher\.js"/);
  assert.match(res.body, /\/api\/luanti\/relay/);
  assert.equal(res.headers["cross-origin-embedder-policy"], "require-corp");
  assert.equal(res.headers["cross-origin-opener-policy"], "same-origin");

  res = fakeRes();
  W.serve({}, res, new URL("http://x/luanti-web/..%2F..%2Fsecret.txt"), send);
  assert.equal(res.statusCode, 404);
});
