import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createPads } from "./pads.mjs";
import { createPeers } from "./peers.mjs";
import { createPadsLink } from "./padsLink.mjs";

// Two SEASIDE servers on this computer, each with its own data folder, talking over real HTTP.
function server(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `link-${name}-`));
  const pads = createPads({ dataDir: () => dir });
  const peers = createPeers({ file: () => path.join(dir, "peers.json") });
  peers.rename(name);
  const vault = path.join(dir, "vault");
  const vaultFile = (rel) => {
    const full = path.resolve(vault, String(rel || ""));
    return full.startsWith(vault + path.sep) ? full : null;
  };
  const link = createPadsLink({ pads, peers, vaultFile });
  const readBody = (req) => new Promise((ok) => {
    const parts = [];
    req.on("data", (c) => parts.push(c));
    req.on("end", () => ok(Buffer.concat(parts)));
  });
  const reply = (res, code, body) => {
    res.statusCode = code;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(body));
  };
  const srv = http.createServer(async (req, res) => {
    if (!(await link.handle(req, res, new URL(req.url, "http://x"), { readBody, send: reply }))) reply(res, 404, {});
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok({ name, dir, pads, peers, link, vault, srv, url: `http://localhost:${srv.address().port}`, port: srv.address().port })));
}

const me = "Mrrowr-murrr";

test("two servers link with a one-time code, share one roster, and send to each other's devices and vaults", async () => {
  const A = await server("Titan");
  const B = await server("iMac");
  try {
    A.pads.hello({ id: "titan-pc-0001", account: me, name: "Titan PC", kind: "desktop" });
    B.pads.hello({ id: "imac-00000001", account: me, name: "iMac", kind: "mac" });

    // A wrong code is refused; the right one works once
    await assert.rejects(B.link.link(A.url, "pdl_wrong", { port: B.port }), /isn't valid/);
    const { code } = A.peers.invite();
    const got = await B.link.link(A.url, code, { port: B.port });
    assert.equal(got.name, "Titan");
    await assert.rejects(B.link.link(A.url, code, { port: B.port }), /isn't valid/);
    // A reaches B where the request came from, on the port B gave
    assert.equal(A.peers.list()[0].url, B.url);
    // tokens are never in what the person sees
    assert.ok(!JSON.stringify(A.peers.list()).includes("pdp_"));

    // each sees both devices, and which server each is on
    const ra = await A.link.roster(me);
    assert.deepEqual(ra.devices.map((d) => `${d.name}@${d.server}`).sort(), ["Titan PC@Titan", "iMac@iMac"]);
    assert.equal(ra.servers.find((s) => s.name === "iMac").here, true);
    const rb = await B.link.roster(me);
    assert.equal(rb.devices.length, 2);

    // a link from Titan PC to the iMac
    await A.link.send(me, { from: "titan-pc-0001", to: "imac-00000001", item: { kind: "link", url: "https://example.org/", title: "Ex" } });
    // a picture: it travels and lands in B's vault
    fs.mkdirSync(path.join(A.vault, "Pictures/Poses"), { recursive: true });
    fs.writeFileSync(path.join(A.vault, "Pictures/Poses/Cat.png"), Buffer.from([137, 80, 78, 71, 1, 2, 3]));
    await A.link.send(me, { from: "titan-pc-0001", to: "imac-00000001", item: { kind: "image", path: "Pictures/Poses/Cat.png", title: "Cat" } });
    const mail = B.pads.hello({ id: "imac-00000001", account: me, name: "iMac", kind: "mac" }).mail;
    assert.equal(mail.length, 2);
    assert.equal(mail[0].from, "Titan PC (Titan)");
    assert.equal(mail[1].item.path, "Pictures/From Titan/Cat.png");
    assert.ok(fs.existsSync(path.join(B.vault, "Pictures/From Titan/Cat.png")));

    // to the iMac's server itself: a note in its vault
    const kept = await A.link.send(me, { from: "titan-pc-0001", to: `server:${B.peers.me().id}`, item: { kind: "text", text: "Hello iMac\nmore" } });
    assert.match(kept.path, /^Sent here\/Hello iMac /);
    assert.match(fs.readFileSync(path.join(B.vault, kept.path), "utf8"), /Sent from Titan PC \(Titan\)/);

    // a server that isn't linked (or was unlinked) is turned away
    B.peers.remove(A.peers.me().id);
    A.link.roster(me); // cached; then ask again after the cache runs out
    await new Promise((r) => setTimeout(r, 4100));
    const after = await A.link.roster(me);
    assert.equal(after.servers.find((s) => s.name === "iMac").here, false);
    assert.match(after.servers.find((s) => s.name === "iMac").error, /no longer knows/);
  } finally {
    A.srv.close();
    B.srv.close();
  }
});
