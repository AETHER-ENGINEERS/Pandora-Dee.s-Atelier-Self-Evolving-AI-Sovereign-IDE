// PBKDF2-HMAC-SHA-256 in plain JavaScript, for pages opened on a plain-http address (a phone on the home network),
// where browsers don't offer their own (crypto.subtle). Same results, so a passcode set on one device works on any.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const IV = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const w = new Uint32Array(64);

/** One SHA-256 block (16 words) into the state h. */
function block(h: Uint32Array, m: Uint32Array, off = 0) {
  for (let i = 0; i < 16; i++) w[i] = m[off + i];
  for (let i = 16; i < 64; i++) {
    const a = w[i - 15], b = w[i - 2];
    const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
    const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
    w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
  }
  let [a, b, c, d, e, f, g, hh] = h;
  for (let i = 0; i < 64; i++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const t1 = (hh + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
    hh = g;
    g = f;
    f = e;
    e = (d + t1) | 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) | 0;
  }
  h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
}

/** SHA-256 of bytes, as 8 words. */
function sha256(bytes: Uint8Array): Uint32Array {
  const len = bytes.length;
  const blocks = Math.ceil((len + 9) / 64);
  const m = new Uint32Array(blocks * 16);
  for (let i = 0; i < len; i++) m[i >> 2] |= bytes[i] << (24 - (i % 4) * 8);
  m[len >> 2] |= 0x80 << (24 - (len % 4) * 8);
  m[blocks * 16 - 1] = len * 8;
  m[blocks * 16 - 2] = Math.floor((len * 8) / 0x100000000);
  const h = new Uint32Array(IV);
  for (let b = 0; b < blocks; b++) block(h, m, b * 16);
  return h;
}

const toBytes = (words: Uint32Array) => {
  const out = new Uint8Array(words.length * 4);
  words.forEach((x, i) => ((out[i * 4] = x >>> 24), (out[i * 4 + 1] = x >>> 16), (out[i * 4 + 2] = x >>> 8), (out[i * 4 + 3] = x)));
  return out;
};

/** The HMAC key's inner and outer states, worked out once (PBKDF2 uses the same key every round). */
function keyed(key: Uint8Array) {
  if (key.length > 64) key = toBytes(sha256(key));
  const pad = (x: number) => {
    const m = new Uint32Array(16);
    for (let i = 0; i < 64; i++) m[i >> 2] |= ((key[i] ?? 0) ^ x) << (24 - (i % 4) * 8);
    const h = new Uint32Array(IV);
    block(h, m);
    return h;
  };
  return { inner: pad(0x36), outer: pad(0x5c) };
}

/** HMAC of a 32-byte message (8 words) with pre-keyed states: two blocks, the hot loop of PBKDF2. */
const msg = new Uint32Array(16);
function hmac32(k: { inner: Uint32Array; outer: Uint32Array }, words: Uint32Array): Uint32Array {
  msg.fill(0);
  msg.set(words);
  msg[8] = 0x80000000;
  msg[15] = (64 + 32) * 8;
  const ih = new Uint32Array(k.inner);
  block(ih, msg);
  msg.set(ih);
  msg[8] = 0x80000000;
  for (let i = 9; i < 15; i++) msg[i] = 0;
  msg[15] = (64 + 32) * 8;
  const oh = new Uint32Array(k.outer);
  block(oh, msg);
  return oh;
}

/** HMAC of any message (for PBKDF2's first round, salt and block number). */
function hmac(key: Uint8Array, data: Uint8Array): Uint32Array {
  const k = key.length > 64 ? toBytes(sha256(key)) : key;
  const ipad = new Uint8Array(64 + data.length);
  const opad = new Uint8Array(64 + 32);
  for (let i = 0; i < 64; i++) ((ipad[i] = (k[i] ?? 0) ^ 0x36), (opad[i] = (k[i] ?? 0) ^ 0x5c));
  ipad.set(data, 64);
  opad.set(toBytes(sha256(ipad)), 64);
  return sha256(opad);
}

/** PBKDF2-HMAC-SHA-256, 32 bytes out (what secure.ts keeps). Yields to the page now and then so it stays responsive. */
export async function pbkdf2Sha256(password: Uint8Array, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const k = keyed(password);
  const first = new Uint8Array(salt.length + 4);
  first.set(salt);
  first[salt.length + 3] = 1; // block 1 (32 bytes is one block)
  let u = hmac(password, first);
  const t = new Uint32Array(u);
  for (let i = 1; i < iterations; i++) {
    u = hmac32(k, u);
    for (let j = 0; j < 8; j++) t[j] ^= u[j];
    if (i % 20_000 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  return toBytes(t);
}
