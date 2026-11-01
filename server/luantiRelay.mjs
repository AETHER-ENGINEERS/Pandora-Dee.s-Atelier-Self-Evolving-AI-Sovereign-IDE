// The relay for Luanti in the browser (luanti-wasm): browsers can't send UDP, so the client talks to this over a
// WebSocket, speaking webshims' proxy protocol (paradust7/webshims, src/emsocket/proxy.js and emsocket.cpp):
//   NEWADDR                       → ADDR <its address> <passcode> <join code>   (an address for this client)
//   BIND <passcode> UDP <port>    → BIND OK, then datagrams both ways, each with a 24-byte header
//                                   (magic, the other end's IPv6 address, its port, the length)
//   PROXY IPV6 TCP fd00::1 53     → PROXY OK, then one name lookup ("name A|AAAA|ANY" → count, records)
//   PROXY IPV6 TCP fd00::1 8080   → PROXY OK, then an HTTP CONNECT tunnel (the client's own web fetches)
// Game traffic goes to ports 1024 and up only, and web tunnels only to ports 80 and 443 of public addresses, so the
// relay can't be turned on the home network's other machines or on well-known services.

import dgram from "node:dgram";
import dns from "node:dns/promises";
import net from "node:net";
import crypto from "node:crypto";

const MAGIC = 0x778b4cf6;
const HEADER = 24;
const SERVICE = "fd00::1";

/** IPv6 text to 16 bytes (IPv4 as ::ffff:a.b.c.d). */
export function toBytes(ip) {
  if (net.isIPv4(ip)) return Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff, ...ip.split(".").map(Number)]);
  const [head, tail = null] = ip.split("::");
  const hs = head ? head.split(":") : [];
  const ts = tail === null ? [] : tail ? tail.split(":") : [];
  const groups = tail === null ? hs : [...hs, ...Array(8 - hs.length - ts.length).fill("0"), ...ts];
  const out = Buffer.alloc(16);
  groups.forEach((g, i) => out.writeUInt16BE(parseInt(g, 16) || 0, i * 2));
  return out;
}
/** 16 bytes to an address: IPv4-mapped ones as plain IPv4. */
export function fromBytes(b) {
  if (b.subarray(0, 10).every((x) => x === 0) && b[10] === 0xff && b[11] === 0xff) return `${b[12]}.${b[13]}.${b[14]}.${b[15]}`;
  const groups = [];
  for (let i = 0; i < 8; i++) groups.push(b.readUInt16BE(i * 2).toString(16));
  return groups.join(":"); // uncompressed is still a valid address, and the client reads it as one
}
export function wrap(ip, port, data) {
  const out = Buffer.alloc(HEADER + data.length);
  out.writeUInt32BE(MAGIC, 0);
  toBytes(ip).copy(out, 4);
  out.writeUInt16BE(port, 20);
  out.writeUInt16BE(data.length, 22);
  data.copy(out, HEADER);
  return out;
}
export function unwrap(buf) {
  if (buf.length < HEADER || buf.readUInt32BE(0) !== MAGIC || buf.readUInt16BE(22) !== buf.length - HEADER) return null;
  return { ip: fromBytes(buf.subarray(4, 20)), port: buf.readUInt16BE(20), data: buf.subarray(HEADER) };
}

/** Not on this computer or the home network: what a web tunnel may reach. */
export function isPublic(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b < 128) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168) || a >= 224);
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPublic(v.slice(7));
  return !(v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith("ff"));
}

export function createLuantiRelay({ lookup = (name, opts) => dns.lookup(name, opts), connect = (port, host) => net.connect(port, host), makeUdp = (type) => dgram.createSocket(type) } = {}) {
  const assigned = new Map(); // passcode → { address, at }
  let next = 2;

  function newAddress() {
    for (const [k, v] of assigned) if (Date.now() - v.at > 6 * 3600_000) assigned.delete(k);
    const address = `fd00::5:${(next++).toString(16)}`;
    const passcode = crypto.randomBytes(16).toString("hex");
    assigned.set(passcode, { address, at: Date.now() });
    return `ADDR ${address} ${passcode} ${crypto.randomBytes(8).toString("hex")}`;
  }

  /** One WebSocket from a Luanti client (conn from wsduplex.mjs). */
  function attach(conn) {
    let mode = null;
    let udp4 = null;
    let udp6 = null;
    let tcp = null;
    let pending = Buffer.alloc(0);
    const cleanup = () => {
      for (const s of [udp4, udp6]) s?.close?.();
      tcp?.destroy();
      udp4 = udp6 = tcp = null;
    };
    conn.onclose = cleanup;

    const udpFor = (ip) => {
      const v4 = net.isIPv4(ip);
      if (v4 ? udp4 : udp6) return v4 ? udp4 : udp6;
      const s = makeUdp(v4 ? "udp4" : "udp6");
      s.on("message", (msg, rinfo) => conn.sendBinary(wrap(rinfo.address, rinfo.port, msg)));
      s.on("error", () => conn.close());
      s.bind(0);
      return v4 ? (udp4 = s) : (udp6 = s);
    };

    async function dnsAnswer(request) {
      const [name, kind = "ANY"] = request.trim().split(/\s+/);
      let records = [];
      try {
        const family = kind === "A" ? 4 : kind === "AAAA" ? 6 : 0;
        records = await lookup(name, { all: true, ...(family ? { family } : {}) });
      } catch {
        records = [];
      }
      const parts = [Buffer.from([Math.min(255, records.length)])];
      for (const r of records.slice(0, 255)) parts.push(r.family === 4 ? Buffer.from([4, ...toBytes(r.address).subarray(12)]) : Buffer.concat([Buffer.from([6]), toBytes(r.address)]));
      conn.sendBinary(Buffer.concat(parts));
      conn.close();
    }

    async function tunnel(data) {
      pending = Buffer.concat([pending, data]);
      const end = pending.indexOf("\r\n\r\n");
      if (end < 0) return pending.length > 8192 ? conn.close() : undefined;
      const head = pending.subarray(0, end).toString("latin1");
      const rest = pending.subarray(end + 4);
      pending = Buffer.alloc(0);
      const m = /^CONNECT\s+(\[[^\]]+\]|[^\s:]+):(\d+)\s+HTTP\/1\.[01]/i.exec(head);
      const port = Number(m?.[2]);
      const refuse = (why) => (conn.sendBinary(Buffer.from(`HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nX-Why: ${why}\r\n\r\n`)), conn.close());
      if (!m || (port !== 443 && port !== 80)) return refuse("only web ports");
      const host = m[1].replace(/^\[|\]$/g, "");
      let ip = host;
      if (!net.isIP(host)) {
        const found = await lookup(host, { all: true }).catch(() => []);
        ip = found.find((r) => isPublic(r.address))?.address ?? "";
      }
      if (!ip || !isPublic(ip)) return refuse("not a public address");
      mode = "tunnel-open";
      tcp = connect(port, ip);
      tcp.on("connect", () => {
        conn.sendBinary(Buffer.from("HTTP/1.1 200 Connection established\r\n\r\n"));
        if (rest.length) tcp.write(rest);
      });
      tcp.on("data", (d) => conn.sendBinary(d));
      tcp.on("close", () => conn.close());
      tcp.on("error", () => conn.close());
    }

    conn.onmessage = (msg) => {
      if (mode === null) {
        if (typeof msg !== "string") return conn.close();
        const p = msg.trim().split(/\s+/);
        if (p[0] === "NEWADDR") return conn.sendText(newAddress());
        if (p[0] === "BIND" && p[2] === "UDP") {
          if (!assigned.has(p[1])) return conn.sendText("BIND FAILED");
          mode = "udp";
          return conn.sendText("BIND OK");
        }
        if (p[0] === "PROXY" && p[2] === "TCP" && p[3] === SERVICE && (p[4] === "53" || p[4] === "8080")) {
          mode = p[4] === "53" ? "dns" : "tunnel";
          return conn.sendText("PROXY OK");
        }
        return conn.close();
      }
      const data = typeof msg === "string" ? Buffer.from(msg) : msg;
      if (mode === "udp") {
        const u = unwrap(data);
        // game traffic only: no well-known ports (DNS, mail, file sharing…) through the relay
        if (!u || u.port < 1024) return;
        udpFor(u.ip).send(u.data, u.port, u.ip.startsWith("::ffff:") ? u.ip.slice(7) : u.ip);
      } else if (mode === "dns") void dnsAnswer(data.toString("utf8"));
      else if (mode === "tunnel") void tunnel(data);
      else if (mode === "tunnel-open") tcp?.write(data);
    };
  }

  return { attach };
}
