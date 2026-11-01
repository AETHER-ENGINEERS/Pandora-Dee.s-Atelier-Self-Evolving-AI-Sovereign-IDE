// A send-only WebSocket for the full browser's pictures: binary frames (the JPEG as it is, with a small JSON header),
// instead of base64 text in the event stream, which is a third bigger and slow to unpack in the viewer (Firefox
// most of all). Only what this needs of the protocol: the handshake, binary messages out, and noticing a close.

import crypto from "node:crypto";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

/** Answer the upgrade request; false when it isn't a WebSocket request. */
export function acceptSocket(req, socket) {
  const key = req.headers["sec-websocket-key"];
  if (!key || String(req.headers.upgrade || "").toLowerCase() !== "websocket") return false;
  const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
  socket.write(["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", `Sec-WebSocket-Accept: ${accept}`, "", ""].join("\r\n"));
  socket.setNoDelay(true);
  // the viewer never sends anything that matters; a close (or a broken connection) ends it
  socket.on("data", (d) => {
    if ((d[0] & 0x0f) === 0x8) socket.end(Buffer.from([0x88, 0x00]));
  });
  socket.on("error", () => socket.destroy());
  return true;
}

/** One binary message (server to viewer: unmasked). */
export function binaryMessage(payload) {
  const n = payload.length;
  const head = n < 126 ? Buffer.from([0x82, n]) : n < 65536 ? Buffer.from([0x82, 126, n >> 8, n & 255]) : Buffer.alloc(10);
  if (n >= 65536) {
    head[0] = 0x82;
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(n), 2);
  }
  return Buffer.concat([head, payload]);
}

/** A picture as one message: 4 bytes of header length, the header ({ id, w, h }), then the JPEG. */
export function frameMessage(header, jpeg) {
  const h = Buffer.from(JSON.stringify(header));
  const len = Buffer.alloc(4);
  len.writeUInt32BE(h.length);
  return binaryMessage(Buffer.concat([len, h, jpeg]));
}
