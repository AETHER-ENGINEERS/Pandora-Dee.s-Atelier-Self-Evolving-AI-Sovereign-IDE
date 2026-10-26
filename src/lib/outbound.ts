// How requests leave the desktop: straight from the browser (JavaScript fetch), or relayed by the
// desktop's own server with Node (HTTP/HTTPS), cURL or Python. Relaying avoids CORS, the browser
// rule that blocks pages from reading answers from servers that don't opt in (AICord, most SearXNG
// setups, many MCP servers). The request itself is the same either way.

export type Via = "desktop" | "curl" | "python" | "browser";

export const VIA_OPTIONS: { id: Via; label: string; hint: string }[] = [
  { id: "desktop", label: "Desktop relay (HTTP/HTTPS)", hint: "The desktop's server sends it with Node. No CORS problems. Recommended." },
  { id: "curl", label: "cURL", hint: "The desktop's server runs cURL. Needs cURL installed (Windows 10+, macOS and most Linux have it)." },
  { id: "python", label: "Python", hint: "The desktop's server runs Python's urllib. Needs Python installed." },
  { id: "browser", label: "Browser (JavaScript)", hint: "Sent straight from this page. Only works when the server allows it (CORS)." },
];

/** Where Python is, when the person set it (the store fills this in; kept apart to avoid an import loop). */
let pythonPath: () => string | undefined = () => undefined;
export function pythonFrom(fn: () => string | undefined) {
  pythonPath = fn;
}

export type OutInit = { method?: string; headers?: Record<string, string>; body?: string | Uint8Array; signal?: AbortSignal; timeout?: number };

function b64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Send a request the chosen way. Answers like fetch() does. */
export async function outbound(url: string, init: OutInit = {}, via: Via = "desktop"): Promise<Response> {
  if (via === "browser") {
    try {
      return await fetch(url, { method: init.method, headers: init.headers, body: init.body as BodyInit | undefined, signal: init.signal });
    } catch (e) {
      if (init.signal?.aborted) throw e;
      throw new Error(
        `The browser couldn't reach ${hostOf(url)}. If the server is running, it's probably blocking pages from reading its answers (CORS): choose "Desktop relay" as the connection method.`,
      );
    }
  }
  const job = {
    url,
    method: init.method ?? "GET",
    headers: init.headers ?? {},
    via: via === "desktop" ? "node" : via,
    python: via === "python" ? pythonPath() || undefined : undefined,
    timeout: init.timeout,
    ...(init.body instanceof Uint8Array ? { bodyB64: b64(init.body) } : init.body != null ? { body: init.body } : {}),
  };
  const r = await fetch("/api/relay", { method: "POST", body: JSON.stringify(job), signal: init.signal });
  const status = Number(r.headers.get("X-Relay-Status") || 0);
  if (!status) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `The desktop relay answered ${r.status}.`);
  }
  let headers: Record<string, string> = {};
  try {
    headers = JSON.parse(decodeURIComponent(r.headers.get("X-Relay-Headers") || "%7B%7D")) as Record<string, string>;
  } catch {
    /* none */
  }
  const empty = status === 204 || status === 304 || init.method === "HEAD";
  return new Response(empty ? null : r.body, { status: status < 200 || status > 599 ? 502 : status, headers });
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

// ---------- the same request, written out for other tools ----------

export type Snippet = "curl" | "python" | "js" | "http";

/** A request written as cURL, Python, JavaScript or raw HTTP. Secrets are shown as a variable, never the value. */
export function snippet(kind: Snippet, url: string, init: { method?: string; headers?: Record<string, string>; body?: string }, secrets: Record<string, string> = {}) {
  const method = (init.method ?? "GET").toUpperCase();
  const hide = (v: string) => {
    let out = v;
    for (const [name, value] of Object.entries(secrets)) if (value && value.length >= 4) out = out.split(value).join(kind === "python" ? `{os.environ['${name}']}` : `$${name}`);
    return out;
  };
  const headers = Object.entries(init.headers ?? {}).map(([k, v]) => [k, hide(v)] as const);
  const body = init.body;
  const usesSecret = (v: string) => v.includes("$") || v.includes("os.environ");
  if (kind === "curl")
    return [
      `curl -X ${method} '${url}'`,
      ...headers.map(([k, v]) => `  -H ${usesSecret(v) ? `"${k}: ${v}"` : `'${k}: ${v}'`}`),
      ...(body ? [`  --data-raw '${body.replace(/'/g, "'\\''")}'`] : []),
    ].join(" \\\n");
  if (kind === "python")
    return [
      "import json, os, urllib.request",
      "",
      `req = urllib.request.Request(`,
      `    ${JSON.stringify(url)},`,
      `    method=${JSON.stringify(method)},`,
      `    headers={${headers.map(([k, v]) => `${JSON.stringify(k)}: ${usesSecret(v) ? `f${JSON.stringify(v)}` : JSON.stringify(v)}`).join(", ")}},`,
      ...(body ? [`    data=json.dumps(${pyLiteral(body)}).encode(),`] : []),
      ")",
      "with urllib.request.urlopen(req) as r:",
      "    print(r.status, r.read().decode())",
    ].join("\n");
  if (kind === "js")
    return [
      `const res = await fetch(${JSON.stringify(url)}, {`,
      `  method: ${JSON.stringify(method)},`,
      `  headers: { ${headers.map(([k, v]) => `${JSON.stringify(k)}: ${usesSecret(v) ? `\`${v.replace(/\$([A-Z0-9_]+)/g, "${process.env.$1}")}\`` : JSON.stringify(v)}`).join(", ")} },`,
      ...(body ? [`  body: JSON.stringify(${body}),`] : []),
      "});",
      "console.log(res.status, await res.text());",
    ].join("\n");
  const u = new URL(url);
  return [`${method} ${u.pathname}${u.search} HTTP/1.1`, `Host: ${u.host}`, ...headers.map(([k, v]) => `${k}: ${v}`), "", body ?? ""].join("\n");
}

/** JSON text as a Python literal (True/False/None, nested and indented). */
function pyLiteral(json: string) {
  const py = (v: unknown, pad: string): string => {
    if (v === null) return "None";
    if (v === true) return "True";
    if (v === false) return "False";
    if (typeof v === "number" || typeof v === "string") return JSON.stringify(v);
    const inner = `${pad}    `;
    if (Array.isArray(v)) return v.length ? `[\n${v.map((x) => inner + py(x, inner)).join(",\n")}\n${pad}]` : "[]";
    const entries = Object.entries(v as Record<string, unknown>);
    return entries.length ? `{\n${entries.map(([k, x]) => `${inner}${JSON.stringify(k)}: ${py(x, inner)}`).join(",\n")}\n${pad}}` : "{}";
  };
  try {
    return py(JSON.parse(json), "    ");
  } catch {
    return JSON.stringify(json);
  }
}
