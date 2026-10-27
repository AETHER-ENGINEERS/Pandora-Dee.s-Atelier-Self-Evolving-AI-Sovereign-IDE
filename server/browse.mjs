// The desktop's Browser: web pages fetched by this server and handed to a sandboxed frame on the apps' address,
// because most sites refuse to be framed directly. The frame has no origin of its own (sandbox without
// allow-same-origin), so a page can't read the desktop, its keys or the apps. Only the desktop's own Browser can
// use this (it needs the key the desktop page gets from /api), and addresses on this computer are refused so a
// page can't reach the desktop's controls through it. Logins and cookies don't carry over: for those, the
// Browser opens the page in your own browser.

import { randomBytes } from "node:crypto";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 PandoraDeeDesktop/3.10";
const MAX_HTML = 12_000_000;

/** Links and GET forms inside the page go back to the Browser, which loads them the same way. */
const NAV = `(function(){var P=parent;function say(m){try{P.postMessage(m,"*")}catch(e){}}
function go(u,tab){say({pddBrowse:tab?"tab":"nav",url:u})}
document.addEventListener("click",function(e){var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(!a)return;var h=a.href;if(!/^https?:/i.test(h))return;if(a.getAttribute("href").charAt(0)==="#")return;e.preventDefault();go(h,e.ctrlKey||e.metaKey||e.button===1||a.target==="_blank")},true);
document.addEventListener("auxclick",function(e){var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(a&&e.button===1&&/^https?:/i.test(a.href)){e.preventDefault();go(a.href,true)}},true);
function asUrl(f){var u=new URL(f.getAttribute("action")?f.action:document.baseURI);u.search="";new FormData(f).forEach(function(v,k){if(typeof v==="string")u.searchParams.append(k,v)});return u.href}
document.addEventListener("submit",function(e){var f=e.target;if(e.defaultPrevented||(f.getAttribute("method")||"get").toLowerCase()!=="get")return;e.preventDefault();go(asUrl(f),false)},false);
var sub=HTMLFormElement.prototype.submit;HTMLFormElement.prototype.submit=function(){if((this.getAttribute("method")||"get").toLowerCase()==="get")return go(asUrl(this),false);return sub.call(this)};
function t(){say({pddBrowse:"title",title:document.title||""})}if(document.readyState!=="loading")t();else document.addEventListener("DOMContentLoaded",t);})();`;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Addresses on this computer, which a page must never reach through the desktop. */
function isLocal(host) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h.endsWith(".localhost") || h === "::1" || h === "0.0.0.0" || /^127\./.test(h) || /^::ffff:127\./.test(h);
}

export function createBrowser() {
  const key = randomBytes(18).toString("hex");

  async function fetchFollow(target) {
    let u = target;
    for (let hop = 0; hop < 8; hop++) {
      const parsed = new URL(u);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error("Only http and https pages open here.");
      if (isLocal(parsed.hostname)) throw new Error("Pages on this computer don't open in the Browser (open them in your own browser).");
      const ask = () => fetch(u, { redirect: "manual", headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*;q=0.8", "Accept-Language": "en;q=0.9, *;q=0.5" }, signal: AbortSignal.timeout(30_000) });
      // one more try when the connection itself fails (a dropped connection or a slow DNS answer)
      const r = await ask().catch((e) => (e?.name === "TimeoutError" ? Promise.reject(e) : new Promise((ok) => setTimeout(ok, 400)).then(ask)));
      const loc = r.headers.get("location");
      if (r.status >= 300 && r.status < 400 && loc) {
        u = new URL(loc, u).href;
        continue;
      }
      return { r, final: u };
    }
    throw new Error("The page kept redirecting.");
  }

  /** GET /browse?k=…&url=… on the apps' address. */
  async function serve(req, res, url) {
    if (url.searchParams.get("k") !== key) {
      res.statusCode = 403;
      return res.end("Not available.");
    }
    // the address comes base64-encoded (u=), since blockers in some browsers stop requests that carry a raw URL
    let target = url.searchParams.get("url") || "";
    const u = url.searchParams.get("u");
    if (u) {
      try {
        target = Buffer.from(u, "base64url").toString("utf8");
      } catch {
        target = "";
      }
    }
    let got;
    try {
      got = await fetchFollow(target);
    } catch (e) {
      return page(res, 502, target, e instanceof Error ? (e.name === "TimeoutError" ? "The site took too long to answer." : e.message) : String(e));
    }
    const { r, final } = got;
    const type = r.headers.get("content-type") || "application/octet-stream";
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    // the sandbox comes with the page itself (not only the frame's attribute): no origin of its own, wherever it opens
    res.setHeader("Content-Security-Policy", "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox");
    res.setHeader("X-Pdd-Final-Url", encodeURIComponent(final));
    if (!/text\/html|application\/xhtml/i.test(type)) {
      res.statusCode = r.status;
      res.setHeader("Content-Type", type);
      const len = r.headers.get("content-length");
      if (len) res.setHeader("Content-Length", len);
      if (!r.body) return res.end();
      for await (const c of r.body) res.write(c);
      return res.end();
    }
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_HTML) return page(res, 413, final, "That page is too big to show here.");
    // the page's own encoding when it names one (most are UTF-8)
    const charset = (/charset=([\w-]+)/i.exec(type) || /<meta[^>]+charset=["']?([\w-]+)/i.exec(buf.subarray(0, 4096).toString("latin1")) || [])[1] || "utf-8";
    let html;
    try {
      html = new TextDecoder(charset).decode(buf);
    } catch {
      html = buf.toString("utf8");
    }
    const inject = `<base href="${esc(final)}"><meta name="referrer" content="no-referrer"><script>${NAV}</script>`;
    // after the opening <head> when it comes first; otherwise at the very top
    const head = html.search(/<head[^>]*>/i);
    const script = html.search(/<script/i);
    html = head >= 0 && (script < 0 || head < script) ? html.slice(0, head) + html.slice(head).replace(/<head[^>]*>/i, (m) => m + inject) : inject + html;
    res.statusCode = r.status;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(html);
  }

  function page(res, status, target, why) {
    res.statusCode = status;
    res.setHeader("Content-Security-Policy", "sandbox");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`<!doctype html><meta charset="utf-8"><body style="font:15px system-ui;padding:32px;color:#ddd;background:#14121c"><h2 style="margin-top:0">This page didn't open here</h2><p>${esc(why)}</p><p style="opacity:.7">${esc(target)}</p><p>Use “Open in your browser” for it.</p></body>`);
  }

  return { key, serve };
}
