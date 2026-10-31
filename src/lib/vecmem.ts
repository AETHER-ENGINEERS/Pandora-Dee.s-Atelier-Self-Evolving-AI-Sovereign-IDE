// Vector memory, Classic's embeddings (app/modules/embed.js) in the desktop. Each character has an index of her
// memory lines, journal entries, (when she wants) her other notes, and collections she fills herself; it lives on the
// computer with the desktop (server/vecmem.mjs) and is a cache rebuilt from her files. This side makes the embeddings
// through her chosen connection and keeps the index in step with her files.

import { desk } from "./store.ts";
import { credential, scopeOf, type Connection } from "./model.ts";
import { outbound } from "./outbound.ts";
import { allowed, blockedBecause } from "./privacy.ts";
import { memoryLines } from "./tools.ts";

export const AUTO_COLLS = ["memory", "journal", "notes"];
const DEFAULT_MODEL = "nomic-embed-text";

type Hit = { id: number; coll: string; src: string; head: string; text: string; score: number; distance: number | null; kw: number; sem: number };

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const r = await fetch("/api/vecmem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `The desktop answered ${r.status}.`);
  return j as T;
}

export const memoryPrefs = (charId: string) => desk().charPrefs[charId]?.memory ?? {};

/** The connection and model that make her embeddings: her choice, else her own connection, else Ollama on this computer. */
export function embedder(charId: string): { conn?: Connection; model: string } {
  const s = desk();
  const p = memoryPrefs(charId);
  const conns = s.model.connections.filter((c) => c.enabled && c.kind !== "aicord");
  const own = s.charPrefs[charId]?.connection;
  const conn = conns.find((c) => c.id === p.connection) ?? conns.find((c) => c.id === own) ?? conns.find((c) => c.kind === "ollama" && scopeOf(c.baseUrl) === "device") ?? conns[0];
  return { conn, model: (p.model || DEFAULT_MODEL).trim() };
}

/** Embeddings for some texts. nomic-embed models want to know whether a text is a question or a passage. */
export async function embed(charId: string, texts: string[], kind: "query" | "document"): Promise<number[][]> {
  const { conn, model } = embedder(charId);
  if (!conn) throw new Error("no connection for embeddings (Settings → AI)");
  const scope = scopeOf(conn.baseUrl);
  if (scope !== "device") {
    const feature = scope === "network" ? "network-models" : "online-models";
    if (!allowed(desk().privacy, feature)) throw new Error(blockedBecause(desk().privacy, feature));
  }
  const prefix = /nomic-embed/i.test(model) ? (kind === "query" ? "search_query: " : "search_document: ") : "";
  const input = texts.map((t) => prefix + t);
  const key = credential(conn, desk().env);
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) };
  const base = conn.baseUrl.trim().replace(/\/+$/, "");
  let vecs: number[][] | undefined;
  if (conn.kind === "ollama") {
    const r = await outbound(`${base}/api/embed`, { method: "POST", headers, body: JSON.stringify({ model, input }) }, conn.via);
    if (r.ok) vecs = ((await r.json()) as { embeddings?: number[][] }).embeddings;
    else if (r.status === 404) {
      // older Ollama: one text at a time
      vecs = [];
      for (const prompt of input) {
        const r2 = await outbound(`${base}/api/embeddings`, { method: "POST", headers, body: JSON.stringify({ model, prompt }) }, conn.via);
        if (!r2.ok) throw new Error(`embeddings failed (${conn.label} answered ${r2.status})`);
        vecs.push(((await r2.json()) as { embedding: number[] }).embedding);
      }
    } else throw new Error(`embeddings failed (${conn.label} answered ${r.status}: ${(await r.text()).slice(0, 160)})`);
  } else {
    const r = await outbound(`${base}/embeddings`, { method: "POST", headers, body: JSON.stringify({ model, input }) }, conn.via);
    if (!r.ok) throw new Error(`embeddings failed (${conn.label} answered ${r.status}: ${(await r.text()).slice(0, 160)})`);
    vecs = ((await r.json()) as { data?: { embedding: number[] }[] }).data?.map((d) => d.embedding);
  }
  if (!Array.isArray(vecs) || vecs.length !== texts.length || !vecs.every((v) => Array.isArray(v) && v.length))
    throw new Error(`no embeddings came back (is "${model}" an embedding model on ${conn.label}?)`);
  return vecs;
}

// ---------- what gets indexed, from her files ----------

type Want = { coll: string; src: string; head: string; text: string };

function memoryChunks(charId: string): Want[] {
  return memoryLines(charId).map((m) => ({ coll: "memory", src: "MEMORY.md", head: m.section, text: m.text }));
}

function journalChunks(files: Record<string, string>): Want[] {
  const out: Want[] = [];
  // (the journal's README is the guide with a sample entry, not an entry)
  for (const f of Object.keys(files).filter((p) => p.startsWith("journal/") && p.endsWith(".md") && !p.endsWith("README.md")).sort()) {
    for (const part of files[f].split(/^(?=##\s)/m)) {
      const m = /^##\s+(.*)\n?([\s\S]*)$/.exec(part);
      if (!m) continue;
      const body = m[2].trim();
      if (body.length < 8) continue;
      const day = /(\d{4}-\d{2}-\d{2})/.exec(f)?.[1] ?? /^(\d{4}-\d{2}-\d{2})/.exec(m[1])?.[1] ?? "";
      const title = m[1].replace(/^\d{4}-\d{2}-\d{2}\s*·\s*/, "").trim();
      out.push({ coll: "journal", src: f, head: `${day} ${title}`.trim(), text: `${day} · ${title}\n${body}`.slice(0, 2500) });
    }
  }
  return out;
}

const NOT_NOTES = /^(MEMORY\.md|SOUL\.md|AGENTS\.md|SYSTEM\.md|journal\/|skills\/|\.index\/)/;

function noteChunks(files: Record<string, string>, prefix = ""): Want[] {
  const out: Want[] = [];
  for (const p of Object.keys(files).sort()) {
    if (!/\.(md|txt)$/i.test(p) || NOT_NOTES.test(p)) continue;
    if (prefix && !(p === prefix || p.startsWith(prefix.replace(/\/+$/, "") + "/"))) continue;
    const text = files[p];
    if (text.length > 300_000) continue;
    const name = p.replace(/^.*\//, "").replace(/\.\w+$/, "");
    let head = "";
    for (const part of text.split(/^(?=#{1,3}\s)/m)) {
      const h = /^#{1,3}\s+(.*)/.exec(part);
      if (h) head = h[1].trim();
      const body = part.replace(/^#{1,3}\s+.*\n?/, "").trim();
      if (body.length < 20) continue;
      const label = `${name}${head ? ` › ${head}` : ""}`;
      let buf = "";
      const flush = () => {
        if (buf.trim().length >= 20) out.push({ coll: "notes", src: p, head, text: `${label}\n${buf.trim()}` });
        buf = "";
      };
      for (const para of body.split(/\n{2,}/)) {
        if (buf.length + para.length > 900 && buf) flush();
        buf += (buf ? "\n\n" : "") + para;
        while (buf.length > 1400) {
          out.push({ coll: "notes", src: p, head, text: `${label}\n${buf.slice(0, 1200)}` });
          buf = buf.slice(1200);
        }
      }
      flush();
    }
    if (out.length > 4000) break;
  }
  return out;
}

// ---------- keeping it in step ----------

const busy = new Map<string, Promise<SyncResult>>();
const lastSync = new Map<string, number>();
const lastError = new Map<string, string>();
type SyncResult = { added: number; removed: number; embedded: number; error: string };

/** Embed whatever has no embedding yet, 16 at a time. A failure leaves the text findable by keywords. */
async function embedPending(charId: string, progress?: (n: number) => void) {
  const { model } = embedder(charId);
  let done = 0;
  for (;;) {
    const rows = await call<{ id: number; text: string }[]>({ op: "pending", char: charId, limit: 16 });
    if (!rows.length) break;
    const vecs = await embed(charId, rows.map((r) => r.text), "document");
    await call({ op: "vectors", char: charId, model, items: rows.map((r, i) => ({ id: r.id, vec: vecs[i] })) });
    done += rows.length;
    progress?.(done);
  }
  return done;
}

/** Make her index match her files (memory and journal always; notes when she indexes them), then embed what's new. */
export function syncMemory(charId: string, opts: { notes?: boolean; path?: string; progress?: (n: number) => void } = {}): Promise<SyncResult> {
  const running = busy.get(charId);
  if (running) return running;
  const job = (async () => {
    const files = desk().filesOf(charId);
    const r1 = await call<{ added: number; removed: number }>({ op: "reconcile", char: charId, colls: ["memory"], want: memoryChunks(charId) });
    const r2 = await call<{ added: number; removed: number }>({ op: "reconcile", char: charId, colls: ["journal"], want: journalChunks(files) });
    let r3 = { added: 0, removed: 0 };
    if (opts.notes || memoryPrefs(charId).notes) r3 = await call({ op: "reconcile", char: charId, colls: ["notes"], want: noteChunks(files, opts.path), prefix: opts.path ?? "" });
    let embedded = 0;
    let error = "";
    if (memoryPrefs(charId).vectors)
      try {
        embedded = await embedPending(charId, opts.progress);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    lastError.set(charId, error);
    lastSync.set(charId, Date.now());
    return { added: r1.added + r2.added + r3.added, removed: r1.removed + r2.removed + r3.removed, embedded, error };
  })().finally(() => busy.delete(charId));
  busy.set(charId, job);
  return job;
}

/** Hybrid search (keywords + meaning) in her index. Collections: memory and journal unless said otherwise; null = all. */
export async function searchMemory(charId: string, query: string, opts: { colls?: string[] | null; k?: number; mode?: "hybrid" | "semantic" | "keyword"; sync?: boolean } = {}) {
  const { colls = ["memory", "journal"], k = 8, mode = "hybrid", sync = true } = opts;
  if (sync && Date.now() - (lastSync.get(charId) ?? 0) > 3000) await syncMemory(charId).catch(() => undefined);
  let vec: number[] | undefined;
  let note = "";
  if (mode !== "keyword" && memoryPrefs(charId).vectors) {
    try {
      [vec] = await embed(charId, [query], "query");
    } catch (e) {
      if (mode === "semantic") throw e;
      note = `keyword search only (${e instanceof Error ? e.message : e})`;
    }
  }
  const r = await call<{ hits: Hit[]; note: string }>({ op: "search", char: charId, query, vec, colls, k, mode: vec ? mode : "keyword" });
  return { hits: r.hits, note: note || (mode !== "keyword" && !memoryPrefs(charId).vectors ? "keyword search only (vector memory is off: Cast → the character → memory)" : r.note) };
}

/** For the prompt: the memory lines that fit what's being talked about (keyword match, or close in meaning). */
export async function memoryForPrompt(charId: string, query: string, k: number): Promise<string[] | undefined> {
  if (!query.trim()) return undefined;
  try {
    const r = await Promise.race([
      searchMemory(charId, query, { colls: ["memory"], k }),
      new Promise<never>((_, no) => setTimeout(() => no(new Error("timeout")), 6000)),
    ]);
    return r.hits.filter((h) => h.kw || (h.distance !== null && h.distance < 0.6)).map((h) => h.text);
  } catch {
    return undefined; // the keyword ranking takes over
  }
}

export async function memoryStatus(charId: string) {
  const s = await call<{ model: string; dim: number; collections: { name: string; chunks: number; embedded: number }[] }>({ op: "status", char: charId });
  const { conn, model } = embedder(charId);
  return { ...s, want: model, via: conn?.label ?? "no connection", error: lastError.get(charId) ?? "" };
}

export async function addToCollection(charId: string, coll: string, text: string, src = "", head = "") {
  const r = await call<{ id: number; added: boolean }>({ op: "add", char: charId, coll, text, src, head });
  let error = "";
  if (memoryPrefs(charId).vectors)
    try {
      await embedPending(charId);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  return { ...r, error };
}

export const removeFromIndex = (charId: string, which: { id?: number; coll?: string; src?: string }) => call<{ removed: number }>({ op: "remove", char: charId, ...which }).then((r) => r.removed);

/** Throw the embeddings away and make them again (after changing the embedding model). */
export async function rebuildMemory(charId: string, progress?: (n: number) => void) {
  await call({ op: "rebuild", char: charId });
  lastSync.delete(charId);
  return syncMemory(charId, { progress });
}

export async function compareTexts(charId: string, a: string, b: string) {
  const [x, y] = await embed(charId, [a, b], "document");
  let dot = 0, nx = 0, ny = 0;
  for (let i = 0; i < x.length; i++) (dot += x[i] * y[i]), (nx += x[i] * x[i]), (ny += y[i] * y[i]);
  return dot / (Math.sqrt(nx * ny) || 1);
}
