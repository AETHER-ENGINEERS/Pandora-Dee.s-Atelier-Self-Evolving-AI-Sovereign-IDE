// Web search, page reading and HTTP calls for the characters, matching Classic's behaviour.

import { desk } from "./store.ts";
import { outbound } from "./outbound.ts";
import { pageToMarkdown } from "./jadeCore.ts";

const send = (url: string, init: Parameters<typeof outbound>[1] = {}) => outbound(url, init, desk().net.via);

const clip = (s: string, n = 12000) => (s.length > n ? `${s.slice(0, n)}\n\n[cut: ${s.length - n} more characters]` : s);

type Hit = { title: string; url: string; snippet: string };

/**
 * Search your own SearXNG. JSON first; SearXNG refuses JSON (403) unless settings.yml lists it under
 * search → formats, so then its ordinary results page is read instead.
 */
export async function searx(address: string, query: string): Promise<Hit[]> {
  const root = address.trim().replace(/\/+$/, "").replace(/\/search$/, "");
  if (!/^https?:\/\//.test(root)) throw new Error("the SearXNG address must start with http:// or https://");
  const q = encodeURIComponent(query);
  const r = await send(`${root}/search?format=json&q=${q}`, { headers: { Accept: "application/json" } });
  if (r.ok && /json/.test(r.headers.get("content-type") ?? "")) {
    const j = (await r.json()) as { results?: { title: string; url: string; content?: string }[] };
    return (j.results ?? []).map((x) => ({ title: x.title, url: x.url, snippet: x.content ?? "" }));
  }
  const page = await send(`${root}/search?q=${q}`, { headers: { Accept: "text/html" } });
  if (!page.ok) throw new Error(`SearXNG answered ${r.status}${r.status === 403 ? " (JSON is turned off in its settings.yml) and its results page answered " + page.status : ""}`);
  const doc = new DOMParser().parseFromString(await page.text(), "text/html");
  const hits: Hit[] = [];
  for (const art of doc.querySelectorAll("article.result, div.result")) {
    const a = (art.querySelector("h3 a") ?? art.querySelector("h4 a") ?? art.querySelector("a.url_header") ?? art.querySelector("a[href^='http']")) as HTMLAnchorElement | null;
    const href = a?.getAttribute("href") ?? "";
    if (!a || !/^https?:/.test(href)) continue;
    hits.push({ title: (a.textContent ?? "").trim() || href, url: href, snippet: (art.querySelector(".content, p")?.textContent ?? "").trim() });
  }
  if (!hits.length && /captcha|too many requests|rate limit/i.test(doc.body?.textContent ?? "")) throw new Error("SearXNG is rate-limiting this computer (its limiter); allow it in limiter.toml or turn the limiter off for your own use");
  return hits;
}

/** Search providers in order: Ollama web search (with a key), SearXNG, DuckDuckGo, Wikipedia. */
export async function webSearch(query: string, max = 5): Promise<string> {
  const s = desk();
  const n = Math.min(Math.max(1, max | 0 || 5), 10);
  const ollamaKey = s.env.OLLAMA_API_KEY ?? "";
  const order = s.web.search === "auto" ? [ollamaKey && "ollama", s.web.searx && "searxng", "ddg", "wikipedia"].filter(Boolean) : [s.web.search];
  const errors: string[] = [];
  for (const p of order as string[]) {
    try {
      let res: Hit[] = [];
      if (p === "ollama") {
        if (!ollamaKey) throw new Error("no OLLAMA_API_KEY in Keys");
        const r = await send("https://ollama.com/api/web_search", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${ollamaKey}` },
          body: JSON.stringify({ query, max_results: n }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        res = (((await r.json()) as { results?: { title: string; url: string; content?: string }[] }).results ?? []).map((x) => ({ title: x.title, url: x.url, snippet: (x.content ?? "").slice(0, 600) }));
      } else if (p === "searxng") {
        if (!s.web.searx) throw new Error("no SearXNG address set");
        res = (await searx(s.web.searx, query)).slice(0, n);
      } else if (p === "ddg") {
        const r = await send(`https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&q=${encodeURIComponent(query)}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as { Heading?: string; AbstractText?: string; AbstractURL?: string; RelatedTopics?: { Text?: string; FirstURL?: string; Topics?: { Text?: string; FirstURL?: string }[] }[] };
        if (j.AbstractText) res.push({ title: j.Heading || query, url: j.AbstractURL ?? "", snippet: j.AbstractText });
        for (const t of (j.RelatedTopics ?? []).flatMap((x) => x.Topics ?? [x])) if (t.FirstURL) res.push({ title: (t.Text ?? "").split(" - ")[0], url: t.FirstURL, snippet: t.Text ?? "" });
        res = res.slice(0, n);
      } else if (p === "wikipedia") {
        const r = await send(`https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=${n}&srsearch=${encodeURIComponent(query)}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        res = (((await r.json()) as { query?: { search?: { title: string; snippet: string }[] } }).query?.search ?? []).map((x) => ({
          title: x.title,
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(x.title.replace(/ /g, "_"))}`,
          snippet: x.snippet.replace(/<[^>]+>/g, ""),
        }));
      }
      if (!res.length) throw new Error("no results");
      return `Results from ${p}:\n\n${res.map((x, i) => `${i + 1}. ${x.title}\n   ${x.url}\n   ${x.snippet.replace(/\s+/g, " ").trim()}`).join("\n\n")}`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${p}: ${(msg === "Failed to fetch" ? "blocked (network or CORS)" : msg).replace(/\.+$/, "")}`);
    }
  }
  throw new Error(`Web search failed: ${errors.join("; ")}. Set a search provider in Connections → Web.`);
}

/** A web page as readable text: Ollama's reader with a key, otherwise r.jina.ai. */
export async function webFetch(url: string): Promise<string> {
  if (!/^https?:\/\//.test(url)) throw new Error("The address must start with http:// or https://");
  // first: fetch it ourselves (through the desktop relay, so no CORS) and turn it into Markdown here, with
  // Jade's Rust core, the way Jade Vault 2.20 does on the phone: no third-party reader sees the page
  try {
    const r = await send(url, { headers: { Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,application/json;q=0.8,*/*;q=0.5" }, timeout: 30 });
    if (r.ok) {
      const ct = r.headers.get("content-type") ?? "";
      const buf = new Uint8Array(await r.arrayBuffer());
      let cs = /charset=([\w-]+)/i.exec(ct)?.[1];
      if (!cs && /html/i.test(ct)) cs = /<meta[^>]+charset=["']?([\w-]+)/i.exec(new TextDecoder("latin1").decode(buf.subarray(0, 4096)))?.[1];
      let text: string;
      try {
        text = new TextDecoder(cs || "utf-8").decode(buf);
      } catch {
        text = new TextDecoder().decode(buf);
      }
      if (/html|xml/i.test(ct) || /^\s*<(!doctype|html)/i.test(text)) {
        const md = await pageToMarkdown(text, url);
        if (md && md.text.trim().length >= 80) return clip(`# ${md.title || url}\n\n${md.text}`);
      } else if (/^text\/|json|markdown/i.test(ct)) return clip(text);
    }
  } catch {
    /* a reader below */
  }
  const key = desk().env.OLLAMA_API_KEY ?? "";
  if (key) {
    try {
      const r = await send("https://ollama.com/api/web_fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ url }),
      });
      if (r.ok) {
        const j = (await r.json()) as { title?: string; content?: string };
        return clip(`# ${j.title || url}\n\n${j.content ?? ""}`);
      }
    } catch {
      /* fall back to the free reader */
    }
  }
  const r = await send(`https://r.jina.ai/${url}`, { headers: { "X-Return-Format": "markdown" } });
  if (!r.ok) throw new Error(`The page reader answered ${r.status}.`);
  return clip(await r.text());
}

/** Fill {{NAME}} from Keys. */
export function fillSecrets(text: string) {
  const env = desk().env;
  return text.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_, name: string) => env[name] ?? "");
}

/** Blank out any key value (4+ characters) that shows up in text. */
export function redact(text: string) {
  let out = text;
  for (const v of Object.values(desk().env)) if (v && v.length >= 4) out = out.split(v).join("[key]");
  return out;
}

const KEEP_HEADERS = ["content-type", "content-length", "location", "retry-after", "x-ratelimit-remaining", "x-ratelimit-reset", "etag", "last-modified", "link"];

export type HttpArgs = {
  method?: string;
  url?: string;
  query?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  json?: unknown;
  form?: Record<string, unknown>;
  body?: string;
  timeout?: number;
  save_to?: string;
};

/**
 * Call any HTTP API. Keys go in as {{NAME}} and never come back out. Binary answers (pictures,
 * PDFs, .xdc apps) are handed to `saveBinary`, which returns where they were kept.
 */
export async function httpRequest(a: HttpArgs, saveBinary: (bytes: Uint8Array, name: string, type: string) => Promise<string>): Promise<string> {
  const method = String(a.method || "GET").toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(method)) throw new Error(`Method ${method} isn't supported.`);
  let url = fillSecrets(String(a.url || ""));
  if (!/^https?:\/\//.test(url)) throw new Error("The address must start with http:// or https://");
  if (a.query && typeof a.query === "object") {
    const u = new URL(url);
    for (const [k, v] of Object.entries(a.query)) u.searchParams.set(k, fillSecrets(String(v)));
    url = u.toString();
  }
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(a.headers ?? {})) headers[k] = fillSecrets(String(v));
  let body: string | undefined;
  if (a.json !== undefined) {
    if (method === "GET" || method === "HEAD") throw new Error(`${method} can't have a body.`);
    body = fillSecrets(JSON.stringify(a.json));
    headers["Content-Type"] ??= "application/json";
  } else if (a.form) {
    if (method === "GET" || method === "HEAD") throw new Error(`${method} can't have a body.`);
    const f = new URLSearchParams();
    for (const [k, v] of Object.entries(a.form)) f.set(k, fillSecrets(String(v)));
    body = f.toString();
    headers["Content-Type"] ??= "application/x-www-form-urlencoded";
  } else if (a.body != null && a.body !== "") {
    if (method === "GET" || method === "HEAD") throw new Error(`${method} can't have a body.`);
    body = fillSecrets(String(a.body));
  }
  const seconds = Math.min(120, Math.max(1, Number(a.timeout) || 30));
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), seconds * 1000);
  let res: Response;
  try {
    res = await send(url, { method, headers, body, signal: ctrl.signal, timeout: seconds });
  } catch (e) {
    throw new Error(ctrl.signal.aborted ? `No answer within ${seconds} seconds.` : `Couldn't reach it (${e instanceof Error ? e.message : e}). `);
  } finally {
    window.clearTimeout(timer);
  }
  const head = KEEP_HEADERS.map((h) => (res.headers.get(h) ? `${h}: ${res.headers.get(h)}` : "")).filter(Boolean).join("\n");
  const type = res.headers.get("content-type") ?? "";
  let out = "";
  if (method === "HEAD" || res.status === 204) out = "";
  else if (/json|text|xml|javascript|csv|yaml|html/i.test(type) || !type) {
    const text = await res.text();
    if (/json/i.test(type)) {
      try {
        out = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        out = text;
      }
    } else out = text;
  } else {
    const bytes = new Uint8Array(await res.arrayBuffer());
    const fromUrl = decodeURIComponent(new URL(res.url || url).pathname.split("/").pop() || "download");
    const name = a.save_to || fromUrl;
    out = `(binary, ${type}, ${bytes.length} bytes) saved to ${await saveBinary(bytes, name, type)}`;
  }
  return redact(`HTTP ${res.status} ${res.statusText}\n${head}\n\n${clip(out)}`.trim());
}
