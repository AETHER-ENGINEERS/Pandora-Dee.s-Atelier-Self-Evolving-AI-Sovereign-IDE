// The desktop side of webxdc: the library on disk (through /api) and the bridge that carries
// updates between open apps, the people playing, and the characters playing along.

export type Pkg = {
  id: string;
  appKey: string;
  name: string;
  version: string;
  filename: string;
  size: number;
  fileCount: number;
  added: number;
  built: number;
  description: string;
  source: string;
  icon: string;
  parent: string;
  notes: string;
};

export type Update = { payload: unknown; info?: string; summary?: string; document?: string; href?: string; serial: number; max_serial?: number };
type Row = { serial: number; at: number; from: string; name: string; update: Omit<Update, "serial" | "max_serial">; descr?: string };

/** Apps run on a different origin from the desktop, so they can't read its storage. */
export function appOrigin(): { origin: string; isolated: boolean } {
  const { protocol, hostname, port } = window.location;
  const p = port ? `:${port}` : "";
  if (hostname === "localhost") return { origin: `${protocol}//127.0.0.1${p}`, isolated: true };
  if (hostname === "127.0.0.1") return { origin: `${protocol}//localhost${p}`, isolated: true };
  return { origin: window.location.origin, isolated: false };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/${path}`, init);
  const type = res.headers.get("content-type") ?? "";
  const body = type.includes("json") ? await res.json() : await res.text();
  if (!res.ok) throw new Error((body as { error?: string })?.error ?? `The desktop server answered ${res.status}.`);
  return body as T;
}

export const library = {
  available: async () => {
    try {
      await api("info");
      return true;
    } catch {
      return false;
    }
  },
  info: () => api<{ dataDir: string; xdcDir: string }>("info"),
  list: () => api<Pkg[]>("xdc"),
  import: (file: File, onProgress?: (text: string) => void) => {
    onProgress?.(`Reading ${file.name}…`);
    return api<{ added: Pkg[]; duplicates: number; errors: string[] }>("xdc/import", {
      method: "POST",
      headers: { "x-filename": encodeURIComponent(file.name) },
      body: file,
    });
  },
  update: (id: string, patch: Partial<Pkg>) => api<Pkg>(`xdc/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  remove: (id: string) => api<{ ok: boolean }>(`xdc/${id}`, { method: "DELETE" }),
  fork: (id: string, version: string) => api<Pkg>(`xdc/${id}/fork`, { method: "POST", body: JSON.stringify({ version }) }),
  files: (id: string) => api<string[]>(`xdc/${id}/files`),
  read: async (id: string, path: string) => {
    const res = await fetch(`/api/xdc/${id}/file?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error(`Couldn't open ${path}.`);
    return res.text();
  },
  write: (id: string, path: string, body: string | Blob) => api(`xdc/${id}/file?path=${encodeURIComponent(path)}`, { method: "PUT", body }),
  removeFile: (id: string, path: string) => api(`xdc/${id}/file?path=${encodeURIComponent(path)}`, { method: "DELETE" }),
  exportUrl: (id: string) => `/api/xdc/${id}/export`,
  iconUrl: (p: Pkg) => (p.icon ? `/api/xdc/${p.id}/icon` : ""),
  runUrl: (p: Pkg, scope: string, addr: string, name: string) =>
    `${appOrigin().origin}/run/${p.id}/index.html?scope=${encodeURIComponent(scope)}&addr=${encodeURIComponent(addr)}&name=${encodeURIComponent(name)}`,
  updates: (scope: string, since = 0) => api<Row[]>(`state/${encodeURIComponent(scope)}?since=${since}`),
  clearUpdates: (scope: string) => api(`state/${encodeURIComponent(scope)}`, { method: "DELETE" }),
};

/** Compare version labels so 0.10 sorts after 0.9. */
export function compareVersions(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/** Versions of every app, newest first. */
export function groupApps(pkgs: Pkg[]) {
  const map = new Map<string, Pkg[]>();
  for (const p of pkgs) map.set(p.appKey, [...(map.get(p.appKey) ?? []), p]);
  for (const list of map.values()) list.sort((a, b) => compareVersions(b.version, a.version) || b.built - a.built);
  return map;
}

// ---------- the bridge ----------

type Frame = { win: Window; scope: string; addr: string; name: string };
const frames = new Set<Frame>();
type Watcher = (scope: string, row: Row) => void;
const watchers = new Set<Watcher>();
let chatHandler: (from: string, app: string, content: { text?: string; file?: { name: string; dataUrl: string } }) => void = () => {};

const toUpdate = (r: Row, max: number): Update => ({ ...r.update, serial: r.serial, max_serial: max });

function broadcast(scope: string, rows: Row[]) {
  if (!rows.length) return;
  const max = rows[rows.length - 1].serial;
  const updates = rows.map((r) => toUpdate(r, max));
  for (const f of frames) if (f.scope === scope) f.win.postMessage({ __pdd: "xdc", type: "updates", updates }, "*");
}

/** Send an update into an app's shared state, as a person or as a character. */
export async function sendUpdate(scope: string, from: string, name: string, update: Omit<Update, "serial" | "max_serial">, descr = "") {
  const clean = JSON.parse(JSON.stringify(update)) as Row["update"];
  const res = await fetch(`/api/state/${encodeURIComponent(scope)}`, { method: "POST", body: JSON.stringify({ from, name, update: clean, descr }) });
  const row = (await res.json()) as Row;
  broadcast(scope, [row]);
  for (const w of watchers) w(scope, row);
  return row;
}

// Live (realtime) messages aren't saved by webxdc, but characters need to see them to take part.
type Live = { at: number; from: string; name: string; text: string };
const liveLog = new Map<string, Live[]>();
const decoder = new TextDecoder();

function recordLive(scope: string, from: string, name: string, data: number[] | Uint8Array) {
  let text = "";
  try {
    text = decoder.decode(data instanceof Uint8Array ? data : new Uint8Array(data));
  } catch {
    text = `(${data.length} bytes)`;
  }
  const list = [...(liveLog.get(scope) ?? []), { at: Date.now(), from, name, text: text.slice(0, 1500) }].slice(-60);
  liveLog.set(scope, list);
}

export function recentLive(scope: string, limit = 15) {
  return (liveLog.get(scope) ?? []).slice(-limit);
}

/** Send a live message to every open copy of an app, as a character would from their own device. */
export function sendLive(scope: string, from: string, name: string, text: string) {
  const bytes = Array.from(new TextEncoder().encode(text));
  recordLive(scope, from, name, bytes);
  for (const f of frames) if (f.scope === scope) f.win.postMessage({ __pdd: "xdc", type: "rt", data: bytes }, "*");
}

export const bridge = {
  attach(win: Window, scope: string, addr: string, name: string) {
    const f = { win, scope, addr, name };
    frames.add(f);
    return () => {
      frames.delete(f);
    };
  },
  watch(fn: Watcher) {
    watchers.add(fn);
    return () => {
      watchers.delete(fn);
    };
  },
  onChat(fn: typeof chatHandler) {
    chatHandler = fn;
  },
};

window.addEventListener("message", (e) => {
  const m = e.data as { __pdd?: string; type?: string; rid?: number; [k: string]: unknown } | null;
  if (!m || m.__pdd !== "xdc") return;
  const frame = [...frames].find((f) => f.win === e.source);
  if (!frame) return;
  const reply = (value: unknown) => frame.win.postMessage({ __pdd: "xdc", type: "reply", rid: m.rid, value }, "*");
  if (m.type === "send") {
    void sendUpdate(frame.scope, frame.addr, frame.name, m.update as Row["update"], String(m.descr ?? ""));
  } else if (m.type === "listen") {
    void library.updates(frame.scope, Number(m.since ?? 0)).then((rows) => {
      const max = rows.length ? rows[rows.length - 1].serial : 0;
      reply(rows.map((r) => toUpdate(r, max)));
    });
  } else if (m.type === "chat") {
    chatHandler(frame.name, frame.scope, (m.content ?? {}) as Parameters<typeof chatHandler>[2]);
    reply(undefined);
  } else if (m.type === "rt-send") {
    recordLive(frame.scope, frame.addr, frame.name, m.data as number[]);
    for (const f of frames) if (f !== frame && f.scope === frame.scope) f.win.postMessage({ __pdd: "xdc", type: "rt", data: m.data }, "*");
  }
});

// ---------- reading what an app or game shows ----------

let screenSeq = 0;
/** Ask a frame for its visible text. Works across origins through the injected helper. */
export function readScreen(win: Window | null | undefined, timeout = 1500): Promise<string> {
  if (!win) return Promise.resolve("");
  return new Promise((resolve) => {
    const rid = ++screenSeq;
    const done = (text: string) => {
      window.removeEventListener("message", on);
      clearTimeout(t);
      resolve(text);
    };
    const on = (e: MessageEvent) => {
      const d = e.data as { __pdd?: string; rid?: number; text?: string } | null;
      if (e.source === win && d?.__pdd === "screen-reply" && d.rid === rid) done(d.text ?? "");
    };
    const t = window.setTimeout(() => done(""), timeout);
    window.addEventListener("message", on);
    win.postMessage({ __pdd: "screen", rid }, "*");
  });
}

/** A short, readable account of recent updates for a character. */
export function describeRows(rows: Row[], limit = 12) {
  return rows
    .slice(-limit)
    .map((r) => {
      const payload = JSON.stringify(r.update.payload);
      return `#${r.serial} ${r.name}: ${r.update.info ? `${r.update.info} · ` : ""}${payload.length > 400 ? `${payload.slice(0, 400)}…` : payload}`;
    })
    .join("\n");
}
