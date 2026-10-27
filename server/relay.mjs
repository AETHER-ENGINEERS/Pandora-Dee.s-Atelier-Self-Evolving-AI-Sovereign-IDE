// The relay: the desktop server makes an outside request for the page, so browser rules (CORS) don't
// get in the way. Three ways to send it: Node's own HTTP/HTTPS, cURL, or Python's urllib.
// The answer streams back as it arrives; the real status and headers ride in X-Relay-* headers.

import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { findCurl, findPython } from "./programs.mjs";

const KEEP = ["content-type", "content-length", "content-disposition", "mcp-session-id", "retry-after", "location", "www-authenticate"];
const HOP = new Set(["host", "connection", "content-length", "transfer-encoding", "accept-encoding", "origin", "referer", "cookie"]);

function cleanHeaders(h = {}) {
  const out = {};
  for (const [k, v] of Object.entries(h)) if (!HOP.has(k.toLowerCase()) && typeof v === "string") out[k] = v;
  return out;
}

function begin(res, status, headers) {
  const keep = {};
  for (const [k, v] of Object.entries(headers)) if (KEEP.includes(k.toLowerCase())) keep[k.toLowerCase()] = v;
  res.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Cache-Control": "no-store",
    "X-Relay-Status": String(status),
    "X-Relay-Headers": encodeURIComponent(JSON.stringify(keep)),
  });
}

function fail(res, message, code = 502) {
  if (res.headersSent) return res.end();
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: message }));
}

/** job: { url, method, headers, body (text), bodyB64, via: "node" | "curl" | "python", timeout (seconds) } */
export async function relay(req, res, job) {
  let url;
  try {
    url = new URL(String(job.url));
  } catch {
    return fail(res, "That isn't a web address.", 400);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return fail(res, "Only http:// and https:// addresses can be relayed.", 400);
  const method = String(job.method || "GET").toUpperCase();
  const headers = cleanHeaders(job.headers);
  // Some hosts (Cloudflare's browser check) turn away Python's and cURL's default names.
  if (!Object.keys(headers).some((k) => k.toLowerCase() === "user-agent")) headers["User-Agent"] = "PandoraDeeDesktop/3.9 (+https://github.com/AETHER-ENGINEERS/pandora-dee)";
  const body = job.bodyB64 ? Buffer.from(job.bodyB64, "base64") : job.body != null && method !== "GET" && method !== "HEAD" ? Buffer.from(String(job.body)) : undefined;
  const timeout = Math.min(600, Math.max(1, Number(job.timeout) || 300));
  const via = job.via === "curl" || job.via === "python" ? job.via : "node";
  const ctrl = new AbortController();
  const stop = () => ctrl.abort();
  req.on("close", stop);
  res.on("close", stop);

  if (via === "node") {
    const timer = setTimeout(stop, timeout * 1000);
    try {
      const r = await fetch(url, { method, headers, body, signal: ctrl.signal, redirect: "follow" });
      begin(res, r.status, Object.fromEntries(r.headers));
      if (r.body) Readable.fromWeb(r.body).on("error", () => res.end()).pipe(res);
      else res.end();
    } catch (e) {
      fail(res, ctrl.signal.aborted ? "The request was stopped or took too long." : `Couldn't reach ${url.host}: ${e?.cause?.code || e?.message || e}`);
    } finally {
      clearTimeout(timer);
    }
    return;
  }

  if (via === "curl") {
    // (Expect: off: cURL otherwise asks "100-continue" before big bodies, which some servers answer with 500)
    const args = ["-sS", "-N", "-L", "-D", "-", "--max-time", String(timeout), "-X", method, "-H", "Expect:"];
    for (const [k, v] of Object.entries(headers)) args.push("-H", `${k}: ${v}`);
    if (body) args.push("--data-binary", "@-");
    args.push(url.href);
    const curl = findCurl();
    if (!curl) return fail(res, "cURL wasn't found on the computer running the desktop. Choose another connection method, or install cURL.");
    const p = spawn(curl.cmd, args, { windowsHide: true });
    ctrl.signal.addEventListener("abort", () => p.kill());
    pipeHeaderStream(p, res, body, "cURL");
    return;
  }

  // Python: urllib, streaming the body in chunks after one line of status + headers as JSON.
  const script = [
    "import sys, json, urllib.request, urllib.error",
    "job = json.loads(sys.stdin.readline())",
    "data = sys.stdin.buffer.read() or None",
    "req = urllib.request.Request(job['url'], data=data if job['method'] not in ('GET','HEAD') else None, method=job['method'], headers=job['headers'])",
    "out = sys.stdout.buffer",
    "try:",
    "    r = urllib.request.urlopen(req, timeout=job['timeout'])",
    "except urllib.error.HTTPError as e:",
    "    r = e",
    "head = json.dumps({'status': r.status if hasattr(r, 'status') else r.code, 'headers': dict(r.headers.items())})",
    "out.write(head.encode() + b'\\n'); out.flush()",
    "while True:",
    "    c = r.read1(8192) if hasattr(r, 'read1') else r.read(8192)",
    "    if not c: break",
    "    out.write(c); out.flush()",
  ].join("\n");
  const python = findPython(job.python || "");
  if (!python)
    return fail(
      res,
      `Python wasn't found on the computer running the desktop${job.python ? ` (not at ${job.python})` : ""}. Set where it is in Connections → Web → Python program, or choose another connection method.`,
    );
  const py = spawn(python.cmd, [...python.args, "-u", "-c", script], { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  ctrl.signal.addEventListener("abort", () => py.kill());
  py.stdin.write(`${JSON.stringify({ url: url.href, method, headers, timeout })}\n`);
  if (body) py.stdin.write(body);
  py.stdin.end();
  let buf = Buffer.alloc(0);
  let started = false;
  let err = "";
  py.stderr.on("data", (d) => (err += d));
  py.stdout.on("data", (chunk) => {
    if (started) return res.write(chunk);
    buf = Buffer.concat([buf, chunk]);
    const nl = buf.indexOf(10);
    if (nl < 0) return;
    try {
      const head = JSON.parse(buf.subarray(0, nl).toString("utf8"));
      begin(res, head.status, head.headers || {});
      started = true;
      if (buf.length > nl + 1) res.write(buf.subarray(nl + 1));
    } catch {
      fail(res, "Python sent something unexpected.");
      py.kill();
    }
  });
  py.on("error", () => fail(res, "Python isn't installed (or isn't on the PATH) on the computer running the desktop."));
  py.on("close", () => (started ? res.end() : fail(res, `Python couldn't make the request. ${err.trim().split("\n").pop() || ""}`.trim())));
}

/** cURL with -D - writes the header block(s) first (one per redirect), then the body. */
function pipeHeaderStream(p, res, body, name) {
  let buf = Buffer.alloc(0);
  let started = false;
  let err = "";
  p.stderr.on("data", (d) => (err += d));
  if (body) p.stdin.write(body);
  p.stdin.end();
  p.stdout.on("data", (chunk) => {
    if (started) return res.write(chunk);
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const end = buf.indexOf("\r\n\r\n");
      if (end < 0) return;
      const block = buf.subarray(0, end).toString("latin1");
      buf = buf.subarray(end + 4);
      const lines = block.split("\r\n");
      const status = Number(/^HTTP\/[\d.]+\s+(\d+)/.exec(lines[0])?.[1] || 0);
      // a redirect or a "100 Continue": another header block follows
      if ((status >= 300 && status < 400 && lines.some((l) => /^location:/i.test(l))) || status === 100) continue;
      const headers = {};
      for (const l of lines.slice(1)) {
        const i = l.indexOf(":");
        if (i > 0) headers[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim();
      }
      begin(res, status || 502, headers);
      started = true;
      if (buf.length) res.write(buf);
      return;
    }
  });
  p.on("error", () => fail(res, `${name} isn't installed (or isn't on the PATH) on the computer running the desktop.`));
  p.on("close", () => (started ? res.end() : fail(res, `${name} couldn't make the request. ${err.trim()}`.trim())));
}
