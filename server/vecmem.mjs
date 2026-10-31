// Vector memory: each character's searchable index of her memory lines, journal entries, notes and her own
// collections, the desktop's version of Classic's /Pandora/.index/vectors.db. The index is a cache kept on the
// computer with the desktop (so every device shares it): delete it and it is rebuilt from her files.
//
// The desktop's page makes the embeddings (it holds the connections and their keys) and sends the numbers here;
// this side stores them and searches: keywords (BM25) and meaning (cosine) fused by reciprocal rank, as Classic does.

import fs from "node:fs";
import path from "node:path";

const RRF = 60;
const AUTO = ["memory", "journal", "notes"];

const hashOf = (s) => {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + s.length.toString(36);
};

const STOP = new Set("the and for are but not you your with this that what when where which who will would could should have has had was were been from they them their there here then than into about just also very some any all can its our out".split(" "));
const tokens = (s) => (String(s).toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).filter((w) => !STOP.has(w)).map((w) => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/, "") : w));

const toB64 = (v) => Buffer.from(new Float32Array(v).buffer).toString("base64");
const fromB64 = (b) => {
  const buf = Buffer.from(b, "base64");
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
};
const norm = (v) => {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return Float32Array.from(v, (x) => x / n);
};

export function createVecMem({ dataDir }) {
  const open = new Map(); // charId -> { file, model, dim, next, chunks: Map<id, chunk>, vecs: Map<id, Float32Array>, timer }

  function load(char) {
    if (!/^[\w.-]{1,80}$/.test(char)) throw new Error("Unknown character.");
    let ix = open.get(char);
    if (ix) return ix;
    const file = path.join(dataDir(), "memory-index", char, "index.json");
    ix = { file, model: "", dim: 0, next: 1, chunks: new Map(), vecs: new Map(), timer: null };
    try {
      const j = JSON.parse(fs.readFileSync(file, "utf8"));
      ix.model = j.model || "";
      ix.dim = j.dim || 0;
      for (const c of j.chunks ?? []) {
        const { vec, ...rest } = c;
        ix.chunks.set(c.id, rest);
        if (vec) ix.vecs.set(c.id, fromB64(vec));
        ix.next = Math.max(ix.next, c.id + 1);
      }
    } catch {
      /* no index yet, or a damaged one: start fresh, it's rebuilt from her files */
    }
    open.set(char, ix);
    return ix;
  }

  function save(ix) {
    clearTimeout(ix.timer);
    ix.timer = setTimeout(() => {
      const chunks = [...ix.chunks.values()].map((c) => (ix.vecs.has(c.id) ? { ...c, vec: toB64(ix.vecs.get(c.id)) } : c));
      fs.mkdirSync(path.dirname(ix.file), { recursive: true });
      const tmp = ix.file + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify({ format: 1, model: ix.model, dim: ix.dim, chunks }));
      fs.renameSync(tmp, ix.file);
    }, 500);
  }

  function insert(ix, w) {
    const c = { id: ix.next++, coll: w.coll, src: String(w.src ?? ""), head: String(w.head ?? ""), text: String(w.text), hash: hashOf(`${w.head ?? ""}\u0001${w.text}`), ts: Date.now() };
    ix.chunks.set(c.id, c);
    return c;
  }
  const drop = (ix, id) => (ix.chunks.delete(id), ix.vecs.delete(id));
  const under = (src, prefix) => !prefix || src === prefix || src.startsWith(prefix.replace(/\/+$/, "") + "/");

  const ops = {
    status({ char }) {
      const ix = load(char);
      const by = new Map();
      for (const c of ix.chunks.values()) {
        const r = by.get(c.coll) ?? { name: c.coll, chunks: 0, embedded: 0 };
        r.chunks++;
        if (ix.vecs.has(c.id)) r.embedded++;
        by.set(c.coll, r);
      }
      return { model: ix.model, dim: ix.dim, collections: [...by.values()].sort((a, b) => a.name.localeCompare(b.name)) };
    },

    // make the given collections match what her files hold now
    reconcile({ char, colls, want, prefix = "" }) {
      const ix = load(char);
      const key = (c, s, h) => `${c}\u0001${s}\u0001${h}`;
      const wanted = new Map();
      for (const w of want ?? []) {
        if (!colls.includes(w.coll) || !String(w.text ?? "").trim()) continue;
        wanted.set(key(w.coll, String(w.src ?? ""), hashOf(`${w.head ?? ""}\u0001${w.text}`)), w);
      }
      let added = 0, removed = 0;
      const have = new Set();
      for (const c of [...ix.chunks.values()]) {
        if (!colls.includes(c.coll) || !under(c.src, prefix)) continue;
        const k = key(c.coll, c.src, c.hash);
        if (wanted.has(k) && !have.has(k)) have.add(k);
        else (drop(ix, c.id), removed++);
      }
      for (const [k, w] of wanted) if (!have.has(k)) (insert(ix, w), added++);
      if (added || removed) save(ix);
      return { added, removed };
    },

    add({ char, coll, text, src, head }) {
      const ix = load(char);
      const hash = hashOf(`${head ?? ""}\u0001${text}`);
      const dup = [...ix.chunks.values()].find((c) => c.coll === coll && c.hash === hash);
      if (dup) return { id: dup.id, added: false };
      const c = insert(ix, { coll, text, src, head });
      save(ix);
      return { id: c.id, added: true };
    },

    pending({ char, limit = 16 }) {
      const ix = load(char);
      const out = [];
      for (const c of ix.chunks.values()) {
        if (ix.vecs.has(c.id)) continue;
        out.push({ id: c.id, text: c.text });
        if (out.length >= limit) break;
      }
      return out;
    },

    vectors({ char, model, items }) {
      const ix = load(char);
      const dim = items[0]?.vec?.length ?? 0;
      if (!dim) return { stored: 0 };
      if (ix.dim && (ix.dim !== dim || (ix.model && model && ix.model !== model)))
        throw new Error(`The index was made with ${ix.model || "another model"} (${ix.dim} numbers per text); this is ${model} (${dim}). Rebuild the index to switch.`);
      ix.dim = dim;
      ix.model = model || ix.model;
      let stored = 0;
      for (const it of items) if (ix.chunks.has(it.id) && it.vec?.length === dim) (ix.vecs.set(it.id, norm(it.vec)), stored++);
      save(ix);
      return { stored };
    },

    search({ char, query, vec, colls, k = 8, mode = "hybrid" }) {
      const ix = load(char);
      const pool = [...ix.chunks.values()].filter((c) => (colls?.length ? colls.includes(c.coll) : c.coll !== "skills"));
      if (!pool.length) return { hits: [], note: "the index is empty" };
      const N = Math.max(30, k * 6);
      const kw = new Map(), sem = new Map(), dist = new Map();
      let note = "";
      if (mode !== "semantic") {
        // BM25 over the pool
        const q = [...new Set(tokens(query))];
        if (q.length) {
          const docs = pool.map((c) => tokens(c.text));
          const avg = docs.reduce((n, d) => n + d.length, 0) / docs.length || 1;
          const df = new Map(q.map((t) => [t, docs.filter((d) => d.includes(t)).length]));
          const scored = [];
          docs.forEach((d, i) => {
            let s = 0;
            for (const t of q) {
              const tf = d.filter((x) => x === t).length;
              if (!tf) continue;
              const idf = Math.log(1 + (docs.length - df.get(t) + 0.5) / (df.get(t) + 0.5));
              s += (idf * tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * (d.length / avg)));
            }
            if (s > 0) scored.push([pool[i].id, s]);
          });
          scored.sort((a, b) => b[1] - a[1]).slice(0, N).forEach(([id], i) => kw.set(id, i + 1));
        }
      }
      if (mode !== "keyword") {
        if (vec?.length && ix.dim && vec.length === ix.dim) {
          const qv = norm(vec);
          const scored = [];
          for (const c of pool) {
            const v = ix.vecs.get(c.id);
            if (!v) continue;
            let d = 0;
            for (let i = 0; i < v.length; i++) d += v[i] * qv[i];
            scored.push([c.id, 1 - d]);
          }
          scored.sort((a, b) => a[1] - b[1]).slice(0, N).forEach(([id, d], i) => (sem.set(id, i + 1), dist.set(id, d)));
        } else if (vec?.length && ix.dim) note = `keyword search only (the embedding model now gives ${vec.length} numbers per text, the index has ${ix.dim}: rebuild it)`;
        else if (!ix.dim) note = "keyword search only (nothing is embedded yet)";
        else note = "keyword search only (couldn't make an embedding for the question)";
      }
      const score = new Map();
      for (const [id, r] of kw) score.set(id, (score.get(id) ?? 0) + 1 / (RRF + r));
      for (const [id, r] of sem) score.set(id, (score.get(id) ?? 0) + 1 / (RRF + r));
      const hits = [...score.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, k)
        .map(([id, s]) => ({ ...ix.chunks.get(id), score: s, distance: dist.has(id) ? dist.get(id) : null, kw: kw.get(id) ?? 0, sem: sem.get(id) ?? 0 }));
      return { hits, note };
    },

    remove({ char, id, coll, src }) {
      const ix = load(char);
      if (!id && !coll && !src) throw new Error("remove needs an id, a source or a collection");
      let n = 0;
      for (const c of [...ix.chunks.values()]) {
        if (id ? c.id === Number(id) : (!src || c.src === src) && (!coll || c.coll === coll)) (drop(ix, c.id), n++);
      }
      if (n) save(ix);
      return { removed: n };
    },

    // after changing the embedding model: the vectors go; memory, journal and notes come back from her files,
    // her own collections keep their text and are embedded again
    rebuild({ char }) {
      const ix = load(char);
      for (const c of [...ix.chunks.values()]) if (AUTO.includes(c.coll)) drop(ix, c.id);
      ix.vecs.clear();
      ix.dim = 0;
      ix.model = "";
      save(ix);
      return { ok: true };
    },
  };

  return {
    run(body) {
      const fn = ops[body?.op];
      if (!fn) throw new Error(`Unknown memory index request "${body?.op}".`);
      return fn(body);
    },
  };
}
