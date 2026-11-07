import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { checkManifest, createModules } from "./modules.mjs";

const SHA = "a".repeat(40);
const app = Buffer.from("PK fake xdc bytes");
const appSum = createHash("sha256").update(app).digest("hex");

function fakeGitHub() {
  const files = {
    "/repos-list": [
      { name: "FAE-AIRGAP", default_branch: "main", html_url: "https://github.com/box/FAE-AIRGAP" },
      { name: "no-module", default_branch: "main", html_url: "x" },
      { name: "Old", archived: true, default_branch: "main", html_url: "x" },
      { name: "chess", default_branch: "main", html_url: "x" },
    ],
  };
  const raw = {
    [`FAE-AIRGAP/main/seaside-module.json`]: JSON.stringify({ seaside: 1, name: "FAE-AIRGAP", kind: "skill", version: "0.1.0", files: ["skills/fae-airgap/SKILL.md"] }),
    [`FAE-AIRGAP/${SHA}/seaside-module.json`]: JSON.stringify({ seaside: 1, name: "FAE-AIRGAP", kind: "skill", version: "0.1.0", files: ["skills/fae-airgap/SKILL.md"] }),
    [`FAE-AIRGAP/${SHA}/skills/fae-airgap/SKILL.md`]: "---\nname: fae-airgap\n---\nWhich room am I in?",
    [`chess/main/seaside-module.json`]: JSON.stringify({ seaside: 1, name: "Chess", kind: "xdc", release: { url: "https://example.org/chess.xdc", sha256: appSum } }),
    [`chess/${SHA}/seaside-module.json`]: JSON.stringify({ seaside: 1, name: "Chess", kind: "xdc", release: { url: "https://example.org/chess.xdc", sha256: appSum } }),
  };
  return async (url) => {
    const ok = (body, bytes) => ({ ok: true, status: 200, json: async () => body, text: async () => body, arrayBuffer: async () => bytes });
    if (url.includes("/orgs/box/repos")) return ok(files["/repos-list"]);
    if (url.includes("/commits/main")) return ok({ sha: SHA });
    if (url === "https://example.org/chess.xdc") return ok(null, app);
    const m = /raw\.githubusercontent\.com\/box\/(.+)$/.exec(url);
    if (m && raw[m[1]] !== undefined) return ok(raw[m[1]]);
    return { ok: false, status: 404 };
  };
}

test("look: only repos with a manifest, pinned to a commit; install brings a skill's files", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pdd-mod-"));
  const mods = createModules({ dataDir: () => dir, fetchFn: fakeGitHub(), importXdc: (b, n) => ({ imported: n, size: b.length }) });
  const list = await mods.look(["box"]);
  assert.deepEqual(list.map((x) => x.repo), ["FAE-AIRGAP", "chess"]);
  assert.equal(list[0].commit, SHA);
  const r = await mods.install("box", "FAE-AIRGAP", SHA);
  assert.deepEqual(r.files, { "skills/fae-airgap/SKILL.md": "---\nname: fae-airgap\n---\nWhich room am I in?" });
  assert.equal(mods.installed()["box/FAE-AIRGAP"].commit, SHA);
  const a = await mods.install("box", "chess", SHA);
  assert.deepEqual(a.app, { imported: "chess.xdc", size: app.length });
});

test("a release that doesn't match its checksum isn't installed", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pdd-mod-"));
  const gh = fakeGitHub();
  const bad = async (url) => (url === "https://example.org/chess.xdc" ? { ok: true, status: 200, arrayBuffer: async () => Buffer.from("tampered") } : gh(url));
  const mods = createModules({ dataDir: () => dir, fetchFn: bad, importXdc: () => assert.fail("must not import") });
  await assert.rejects(mods.install("box", "chess", SHA), /checksum doesn't match/);
  assert.deepEqual(mods.installed(), {});
});

test("manifests are checked", () => {
  assert.throws(() => checkManifest({ seaside: 2, kind: "skill", name: "x" }), /"seaside": 1/);
  assert.throws(() => checkManifest({ seaside: 1, kind: "plugin", name: "x" }), /kind must be/);
  assert.throws(() => checkManifest({ seaside: 1, kind: "skill", name: "x", files: ["../../etc/passwd"] }), /isn't a file under skills/);
  assert.throws(() => checkManifest({ seaside: 1, kind: "xdc", name: "x", release: { url: "https://a/b.xdc" } }), /sha256/);
  assert.equal(checkManifest({ seaside: 1, kind: "mcp", name: "pandora-mcp", mcp: { command: "node", args: ["s.cjs"] } }).kind, "mcp");
});
