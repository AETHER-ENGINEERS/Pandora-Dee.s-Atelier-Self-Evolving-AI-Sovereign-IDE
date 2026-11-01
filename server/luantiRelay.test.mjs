import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import dgram from "node:dgram";
import { openDuplex } from "./wsduplex.mjs";
import { createLuantiRelay, wrap, unwrap, isPublic, fromBytes, toBytes } from "./luantiRelay.mjs";

// A relay on a real HTTP server, and the real WebSocket client Node has (as a browser would use it).
async function relayServer() {
  const relay = createLuantiRelay();
  const srv = http.createServer((_, res) => res.end());
  srv.on("upgrade", (req, socket) => {
    const conn = openDuplex(req, socket);
    if (conn) relay.attach(conn);
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { srv, url: `ws://127.0.0.1:${srv.address().port}/` };
}
function client(url) {
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";
  const queue = [];
  let wake = null;
  ws.onmessage = (e) => (queue.push(e.data), wake?.());
  const next = () =>
    queue.length
      ? Promise.resolve(queue.shift())
      : new Promise((r) => {
          wake = () => {
            wake = null;
            r(queue.shift());
          };
        });
  const closed = new Promise((r) => (ws.onclose = r));
  return { ws, next, closed, open: new Promise((r) => (ws.onopen = r)) };
}

test("addresses: both ways, and which are public", () => {
  assert.equal(fromBytes(toBytes("203.0.113.9")), "203.0.113.9");
  assert.equal(unwrap(wrap("10.1.2.3", 30000, Buffer.from("hi"))).ip, "10.1.2.3");
  assert.equal(isPublic("8.8.8.8"), true);
  for (const ip of ["127.0.0.1", "192.168.3.5", "10.0.0.1", "100.117.100.57", "::1", "fd00::1", "fe80::1"]) assert.equal(isPublic(ip), false, ip);
});

test("a Luanti client gets an address, binds, and its game traffic reaches a server and comes back", async () => {
  const { srv, url } = await relayServer();
  const game = dgram.createSocket("udp4");
  game.on("message", (m, r) => game.send(Buffer.concat([Buffer.from("echo:"), m]), r.port, r.address));
  await new Promise((r) => game.bind(0, "127.0.0.1", r));
  try {
    let c = client(url);
    await c.open;
    c.ws.send("NEWADDR");
    const [kind, address, passcode, join] = String(await c.next()).split(" ");
    assert.equal(kind, "ADDR");
    assert.match(address, /^fd00::/);
    assert.match(join, /^[0-9a-f]{16}$/);
    c.ws.close();

    c = client(url);
    await c.open;
    c.ws.send("BIND wrong UDP 30000");
    assert.equal(await c.next(), "BIND FAILED");
    c.ws.close();

    c = client(url);
    await c.open;
    c.ws.send(`BIND ${passcode} UDP 30000`);
    assert.equal(await c.next(), "BIND OK");
    c.ws.send(wrap("127.0.0.1", game.address().port, Buffer.from("hello server")));
    const back = unwrap(Buffer.from(await c.next()));
    assert.equal(back.data.toString(), "echo:hello server");
    assert.equal(back.port, game.address().port);
    c.ws.close();
  } finally {
    game.close();
    srv.close();
  }
});

test("name lookups, and web tunnels only to public web addresses", async () => {
  const { srv, url } = await relayServer();
  try {
    let c = client(url);
    await c.open;
    c.ws.send("PROXY IPV6 TCP fd00::1 53");
    assert.equal(await c.next(), "PROXY OK");
    c.ws.send(new TextEncoder().encode("localhost A"));
    const reply = new Uint8Array(await c.next());
    assert.ok(reply[0] >= 1);
    assert.deepEqual([...reply.subarray(1, 6)], [4, 127, 0, 0, 1]);

    for (const target of ["127.0.0.1:443", "192.168.1.1:80", "example.org:22"]) {
      c = client(url);
      await c.open;
      c.ws.send("PROXY IPV6 TCP fd00::1 8080");
      assert.equal(await c.next(), "PROXY OK");
      c.ws.send(new TextEncoder().encode(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`));
      assert.match(new TextDecoder().decode(await c.next()), /^HTTP\/1\.1 403/, target);
    }

    c = client(url);
    await c.open;
    c.ws.send("PROXY IPV4 TCP 192.168.1.1 22");
    await c.closed;
  } finally {
    srv.close();
  }
});
