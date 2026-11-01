// A two-way WebSocket over an upgraded socket (the Luanti relay's): text and binary messages both ways, fragments
// joined, pings answered, closes honoured. Only what a same-origin page needs; no extensions (no compression).

import crypto from "node:crypto";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_MESSAGE = 4 * 1024 * 1024;

/** Answer the upgrade and return a small connection object, or null when it isn't a WebSocket request. */
export function openDuplex(req, socket) {
  const key = req.headers["sec-websocket-key"];
  if (!key || String(req.headers.upgrade || "").toLowerCase() !== "websocket") return null;
  const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
  socket.write(["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", `Sec-WebSocket-Accept: ${accept}`, "", ""].join("\r\n"));
  socket.setNoDelay(true);

  const conn = { onmessage: null, onclose: null, open: true };
  let buf = Buffer.alloc(0);
  let parts = [];
  let partsType = 0;

  const frame = (op, payload) => {
    const n = payload.length;
    const head = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255]) : Buffer.alloc(10);
    if (n >= 65536) {
      head[0] = 0x80 | op;
      head[1] = 127;
      head.writeBigUInt64BE(BigInt(n), 2);
    }
    return Buffer.concat([head, payload]);
  };
  conn.sendText = (s) => conn.open && socket.write(frame(0x1, Buffer.from(String(s))));
  conn.sendBinary = (b) => conn.open && socket.write(frame(0x2, Buffer.isBuffer(b) ? b : Buffer.from(b)));
  conn.close = () => {
    if (!conn.open) return;
    conn.open = false;
    socket.end(frame(0x8, Buffer.alloc(0)));
    conn.onclose?.();
  };
  const gone = () => {
    if (!conn.open) return;
    conn.open = false;
    conn.onclose?.();
  };

  socket.on("data", (chunk) => {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    for (;;) {
      if (buf.length < 2) return;
      const fin = (buf[0] & 0x80) !== 0;
      const op = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let at = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        at = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        len = Number(buf.readBigUInt64BE(2));
        at = 10;
      }
      if (len > MAX_MESSAGE || !masked) return conn.close(); // browsers always mask; anything else isn't one
      if (buf.length < at + 4 + len) return;
      const mask = buf.subarray(at, at + 4);
      const data = Buffer.from(buf.subarray(at + 4, at + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      buf = buf.subarray(at + 4 + len);
      if (op === 0x8) return conn.close();
      if (op === 0x9) {
        socket.write(frame(0xa, data));
        continue;
      }
      if (op === 0xa) continue;
      if (op === 0x1 || op === 0x2) {
        parts = [data];
        partsType = op;
      } else if (op === 0x0) parts.push(data);
      else return conn.close();
      if (fin) {
        const whole = parts.length === 1 ? parts[0] : Buffer.concat(parts);
        parts = [];
        if (whole.length > MAX_MESSAGE) return conn.close();
        conn.onmessage?.(partsType === 0x1 ? whole.toString("utf8") : whole);
      }
    }
  });
  socket.on("close", gone);
  socket.on("error", () => (socket.destroy(), gone()));
  return conn;
}
