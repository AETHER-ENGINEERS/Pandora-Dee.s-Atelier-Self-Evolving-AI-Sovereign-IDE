import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPads } from "./pads.mjs";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pads-"));
const P = createPads({ dataDir: () => dir });
const me = "Mrrowr-murrr";

test("devices report in, get a place in the room, and show what's on them", () => {
  P.hello({ id: "laptop-0001", account: me, name: "ROG laptop", kind: "laptop", screen: { w: 1920, h: 1080, dpr: 1.25 }, state: { windows: [{ app: "music", title: "Music", x: 10, y: 10, w: 800, h: 600, front: true }] } });
  const r = P.hello({ id: "phone-00001", account: me, name: "S24", kind: "phone", screen: { w: 412, h: 915, dpr: 3 } });
  assert.deepEqual(r.devices.map((d) => d.name).sort(), ["ROG laptop", "S24"]);
  const laptop = r.devices.find((d) => d.id === "laptop-0001");
  const phone = r.devices.find((d) => d.id === "phone-00001");
  assert.equal(laptop.here, true);
  assert.equal(laptop.state.windows[0].title, "Music");
  // the second device is placed to the right of the first
  assert.ok(phone.layout.x > laptop.layout.x);
  // another account sees none of them
  assert.equal(P.roster("someone else").devices.length, 0);
});

test("the arrangement is kept; forgetting a device removes its card", () => {
  P.arrange(me, { "phone-00001": { x: -400, y: 120 }, "not-mine-123": { x: 1, y: 1 } });
  let r = P.roster(me);
  assert.deepEqual(r.devices.find((d) => d.id === "phone-00001").layout, { x: -400, y: 120 });
  assert.equal(r.devices.length, 2);
  r = P.forget(me, "phone-00001");
  assert.deepEqual(r.devices.map((d) => d.id), ["laptop-0001"]);
});

test("send to: a device gets what another sent it, once, the next time it reports in", () => {
  P.hello({ id: "tablet-0001", account: me, name: "Tab", kind: "tablet" });
  P.sendTo(me, { from: "laptop-0001", to: "tablet-0001", item: { kind: "link", url: "https://example.org/x", title: "X" } });
  assert.throws(() => P.sendTo(me, { from: "laptop-0001", to: "tablet-0001", item: { kind: "link", url: "javascript:alert(1)" } }), /nothing to send/);
  assert.throws(() => P.sendTo("someone else", { from: "laptop-0001", to: "tablet-0001", item: { kind: "text", text: "hi" } }), /isn't in/);
  let r = P.hello({ id: "tablet-0001", account: me, name: "Tab", kind: "tablet" });
  assert.equal(r.mail.length, 1);
  assert.equal(r.mail[0].from, "ROG laptop");
  assert.equal(r.mail[0].item.url, "https://example.org/x");
  r = P.hello({ id: "tablet-0001", account: me, name: "Tab", kind: "tablet" });
  assert.equal(r.mail.length, 0);
});

test("odd input is refused or tidied", () => {
  assert.throws(() => P.hello({ id: "../x", account: me }), /Which device/);
  const r = P.hello({ id: "odd-device-1", account: me, kind: "toaster", name: "x".repeat(500), screen: { w: -5 } });
  const d = r.devices.find((x) => x.id === "odd-device-1");
  assert.equal(d.kind, "other");
  assert.equal(d.name.length, 60);
  assert.equal(d.screen.w, 200);
});
