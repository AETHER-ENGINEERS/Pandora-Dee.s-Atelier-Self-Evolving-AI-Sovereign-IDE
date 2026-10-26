// Your notes: markdown files in the vault (the desktop's data folder), with [[wiki links]],
// backlinks, #tags, tasks and ranked search — the same rules as Classic's notes, in plain words.
// Paths are relative to the vault, with forward slashes and no leading slash: "guides/Linking Notes.md".

import { create } from "zustand";

export type VaultEntry = { path: string; dir: boolean; size: number; mtime: number };

type NotesState = {
  loaded: boolean;
  loading: boolean;
  error: string;
  /** Every file and folder in the vault. */
  files: VaultEntry[];
  /** The text of every note. */
  texts: Record<string, string>;
  /** Bumped on every change, so indexes know to rebuild. */
  version: number;
};

export const useNotes = create<NotesState>(() => ({ loaded: false, loading: false, error: "", files: [], texts: {}, version: 0 }));
const ns = () => useNotes.getState();
const bump = (patch: Partial<NotesState>) => useNotes.setState((s) => ({ ...patch, version: s.version + 1 }));

// ---------- paths ----------

export const isNote = (p: string) => /\.(md|markdown)$/i.test(p);
export const baseOf = (p: string) => p.split("/").pop() ?? p;
export const parentOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
export const noteName = (p: string) => baseOf(p).replace(/\.(md|markdown)$/i, "");
const nameKey = (s: string) => noteName(s).toLowerCase().replace(/[\s_-]+/g, " ").trim();
export const vaultUrl = (p: string) => `/api/vault/file?path=${encodeURIComponent(p)}`;

/** Tidy a path someone typed: forward slashes, no "..", no leading slash. */
export function cleanVaultPath(raw: string) {
  return String(raw ?? "")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^\/?vault\//, "")
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s && s !== "." && s !== "..")
    .join("/");
}

/** Characters not allowed in a note's name. */
export const safeTitle = (s: string) => String(s || "").replace(/[\\/:*?"<>|[\]#^]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);

/** A free path in a folder: "Name.md", then "Name 2.md"… */
export function freePath(dir: string, name: string, ext = ".md") {
  const taken = new Set(ns().files.map((f) => f.path.toLowerCase()));
  const base = safeTitle(name) || "Untitled";
  const at = (n: string) => (dir ? `${dir}/${n}` : n);
  let p = at(`${base}${ext}`);
  for (let i = 2; taken.has(p.toLowerCase()); i++) p = at(`${base} ${i}${ext}`);
  return p;
}

// ---------- loading ----------

const api = (route: string, body?: unknown) =>
  fetch(`/api/vault/${route}`, body === undefined ? undefined : { method: "POST", body: JSON.stringify(body) }).then(async (r) => {
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j as { error?: string }).error || `The vault answered ${r.status}.`);
    return j;
  });

export async function loadNotes(force = false) {
  const s = ns();
  if (s.loading || (s.loaded && !force)) return;
  useNotes.setState({ loading: true, error: "" });
  try {
    const [files, texts] = await Promise.all([api("tree") as Promise<VaultEntry[]>, api("notes") as Promise<Record<string, string>>]);
    bump({ files, texts, loaded: true, loading: false });
  } catch (e) {
    useNotes.setState({ loading: false, error: e instanceof Error ? e.message : String(e) });
  }
}

const addEntry = (files: VaultEntry[], e: VaultEntry) => {
  const out = files.filter((f) => f.path !== e.path);
  // make sure every parent folder is listed
  for (let d = parentOf(e.path); d; d = parentOf(d)) if (!out.some((f) => f.path === d)) out.push({ path: d, dir: true, size: 0, mtime: 0 });
  out.push(e);
  return out;
};

// ---------- the index ----------

export const WIKI_RE = /\[\[([^[\]\n|#]+)(#[^[\]\n|]*)?(?:\|([^[\]\n]+))?\]\]/g;
const TAG_RE = /(^|[\s(\[,;])#([A-Za-z][\w/-]*)/g;
const MD_LINK_RE = /\]\(([^)\s]+\.(?:md|markdown))((?:#[^)\s]*)?)\)/gi;
/** Text with code and math blanked out, so links and tags inside them don't count. */
export const stripCode = (md: string) =>
  String(md)
    .replace(/^(```|~~~)[\s\S]*?^\1/gm, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$(?!\s)[^$\n]+?\$/g, " ");

export type Index = {
  notes: string[];
  out: Map<string, Set<string>>;
  back: Map<string, Set<string>>;
  tags: Map<string, Set<string>>;
  missing: Map<string, Set<string>>;
  words: number;
};

/** Which note a link means: the exact path, then by name (nearest folder first). */
export function resolveIn(notes: string[], target: string, from?: string): string | null {
  let t = String(target ?? "").trim().replace(/\\/g, "/");
  if (!t) return null;
  if (!isNote(t)) t += ".md";
  const set = new Set(notes);
  const dir = from ? parentOf(from) : "";
  const rooted = t.startsWith("/");
  const clean = cleanVaultPath(t);
  for (const cand of rooted ? [clean] : [dir ? cleanVaultPath(`${dir}/${t}`) : clean, clean]) if (set.has(cand)) return cand;
  const lc = clean.toLowerCase();
  const base = lc.split("/").pop()!;
  let hits = lc.includes("/") ? notes.filter((p) => p.toLowerCase() === lc || p.toLowerCase().endsWith(`/${lc}`)) : [];
  if (!hits.length) hits = notes.filter((p) => baseOf(p).toLowerCase() === base);
  if (!hits.length) {
    const k = nameKey(base);
    if (k) hits = notes.filter((p) => nameKey(p) === k);
  }
  if (!hits.length) return null;
  hits.sort((a, b) => Number(parentOf(b) === dir) - Number(parentOf(a) === dir) || a.length - b.length || a.localeCompare(b));
  return hits[0];
}

export function buildIndex(texts: Record<string, string>): Index {
  const notes = Object.keys(texts).filter(isNote).sort((a, b) => a.localeCompare(b));
  const idx: Index = { notes, out: new Map(), back: new Map(), tags: new Map(), missing: new Map(), words: 0 };
  for (const p of notes) idx.back.set(p, new Set());
  for (const p of notes) {
    const text = texts[p] ?? "";
    const body = stripCode(text);
    const out = new Set<string>();
    const miss = new Set<string>();
    for (const m of body.matchAll(WIKI_RE)) {
      const r = resolveIn(notes, m[1], p);
      if (r) {
        if (r !== p) {
          out.add(r);
          idx.back.get(r)?.add(p);
        }
      } else miss.add(m[1].trim());
    }
    for (const m of body.matchAll(MD_LINK_RE)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(m[1])) continue;
      let target = m[1];
      try {
        target = decodeURIComponent(m[1]);
      } catch {
        /* keep as written */
      }
      const r = resolveIn(notes, target, p);
      if (r && r !== p) {
        out.add(r);
        idx.back.get(r)?.add(p);
      }
    }
    idx.out.set(p, out);
    idx.missing.set(p, miss);
    for (const m of body.matchAll(TAG_RE)) {
      const tag = m[2].replace(/[/-]+$/, "").toLowerCase();
      if (!tag) continue;
      if (!idx.tags.has(tag)) idx.tags.set(tag, new Set());
      idx.tags.get(tag)!.add(p);
    }
    for (const t of frontmatterTags(text)) {
      if (!idx.tags.has(t)) idx.tags.set(t, new Set());
      idx.tags.get(t)!.add(p);
    }
    idx.words += (text.match(/\S+/g) || []).length;
  }
  return idx;
}

let cached: { version: number; idx: Index } | null = null;
export function vaultIndex(): Index {
  const s = ns();
  if (!cached || cached.version !== s.version) cached = { version: s.version, idx: buildIndex(s.texts) };
  return cached.idx;
}
export const resolveNote = (target: string, from?: string) => resolveIn(vaultIndex().notes, target, from);
export const noteTags = (p: string) => [...vaultIndex().tags.entries()].filter(([, s]) => s.has(p)).map(([t]) => t).sort();

/** How to write a link to a note: its name when that's unique, otherwise its path. */
export function linkName(p: string) {
  const k = noteName(p).toLowerCase();
  const twins = vaultIndex().notes.filter((n) => noteName(n).toLowerCase() === k).length;
  return twins > 1 ? p.replace(/\.(md|markdown)$/i, "") : noteName(p);
}

// ---------- frontmatter ----------

export function splitFrontmatter(text: string): { fm: string; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  return m ? { fm: m[1], body: text.slice(m[0].length) } : { fm: "", body: text };
}

/** A small YAML subset: key: value, key: [a, b], and "key:" followed by "- item" lines. */
export function parseYaml(fm: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let listKey: string | null = null;
  const val = (v: string): unknown => {
    v = v.trim();
    if (!v) return null;
    if (/^\[.*\]$/.test(v)) return v.slice(1, -1).split(",").map((x) => val(x)).filter((x) => x !== null && x !== "");
    if (/^(['"]).*\1$/.test(v)) return v.slice(1, -1);
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    if (/^(true|false)$/i.test(v)) return /^true$/i.test(v);
    if (/^(null|~)$/i.test(v)) return null;
    return v;
  };
  for (const line of fm.split(/\r?\n/)) {
    const li = /^\s+-\s+(.*)$/.exec(line);
    if (li && listKey) {
      const cur = out[listKey];
      out[listKey] = [...(Array.isArray(cur) ? cur : []), val(li[1])];
      continue;
    }
    const m = /^([\w][\w -]*?)\s*:\s*(.*)$/.exec(line);
    if (!m) {
      listKey = null;
      continue;
    }
    const k = m[1].trim();
    const v = val(m[2]);
    out[k] = v;
    listKey = v === null ? k : null;
  }
  return out;
}

function frontmatterTags(text: string): string[] {
  const { fm } = splitFrontmatter(text);
  if (!fm) return [];
  const data = parseYaml(fm);
  return ([] as unknown[])
    .concat(data.tags ?? data.tag ?? [])
    .flatMap((x) => String(x).split(/[\s,]+/))
    .map((x) => x.replace(/^#/, "").toLowerCase())
    .filter(Boolean);
}

// ---------- search and tasks ----------

export type Hit = { path: string; score: number; snippet: string };

/** Ranked by name, then how often the words appear, then how many notes link here. "#tag" finds a tag. */
export function searchNotes(query: string, limit = 20): Hit[] {
  const q = String(query ?? "").trim();
  if (!q) return [];
  const idx = vaultIndex();
  const texts = ns().texts;
  const tagQ = /^#[\w/-]+$/.test(q) ? q.slice(1).toLowerCase() : null;
  const terms = tagQ ? [] : q.toLowerCase().split(/\s+/).filter(Boolean);
  const res: Hit[] = [];
  for (const p of idx.notes) {
    const text = texts[p] ?? "";
    const lc = text.toLowerCase();
    const name = noteName(p).toLowerCase();
    const pl = p.toLowerCase();
    if (tagQ) {
      if (![...idx.tags.entries()].some(([t, s]) => (t === tagQ || t.startsWith(`${tagQ}/`)) && s.has(p))) continue;
    } else if (!terms.every((t) => lc.includes(t) || pl.includes(t))) continue;
    let score = 0;
    let first = -1;
    for (const t of terms) {
      if (name === t) score += 30;
      else if (name.includes(t)) score += 12;
      let i = -1;
      let c = 0;
      while ((i = lc.indexOf(t, i + 1)) >= 0 && c < 60) {
        if (first < 0 || i < first) first = i;
        c++;
      }
      score += c;
    }
    if (tagQ) {
      first = lc.indexOf(`#${tagQ}`);
      score = 1;
    }
    score += Math.min(5, idx.back.get(p)?.size ?? 0) * 0.5;
    const s = Math.max(0, (first < 0 ? 0 : first) - 50);
    const snippet = (s ? "…" : "") + text.slice(s, s + 190).replace(/\s+/g, " ").trim() + (text.length > s + 190 ? "…" : "");
    res.push({ path: p, score, snippet });
  }
  return res.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, limit);
}

export type Task = { path: string; line: number; done: boolean; text: string; n: number };

/** The task checkboxes in a note, outside code, numbered in order. */
export function tasksIn(text: string, path = ""): Task[] {
  const out: Task[] = [];
  let fence = false;
  text.split("\n").forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    if (fence) return;
    const m = /^\s*(?:[-*+]|\d+[.)]) \[( |x|X)\] (.*)$/.exec(l);
    if (m) out.push({ path, line: i + 1, done: m[1] !== " ", text: m[2], n: out.length });
  });
  return out;
}

/** Tasks across the notes (leaving out folders like the templates, whose boxes are placeholders). */
export function allTasks(open = true, skip: string[] = []): Task[] {
  const texts = ns().texts;
  const out = skip.map(cleanVaultPath).filter(Boolean);
  return vaultIndex()
    .notes.filter((p) => !out.some((d) => p.startsWith(`${d}/`)))
    .flatMap((p) => tasksIn(texts[p] ?? "", p))
    .filter((t) => !open || !t.done);
}

/** Tick or untick the nth task of a note. */
export function toggleTaskText(text: string, n: number, done?: boolean) {
  const t = tasksIn(text)[n];
  if (!t) return text;
  const lines = text.split("\n");
  const want = done ?? !t.done;
  lines[t.line - 1] = lines[t.line - 1].replace(/\[( |x|X)\]/, want ? "[x]" : "[ ]");
  return lines.join("\n");
}

// ---------- changes ----------

export async function writeNote(path: string, text: string) {
  const p = cleanVaultPath(path);
  if (!p) throw new Error("The note needs a name.");
  const res = await fetch(vaultUrl(p), { method: "PUT", body: text });
  if (!res.ok) throw new Error(`Couldn't save ${p}.`);
  const s = ns();
  bump({ texts: isNote(p) ? { ...s.texts, [p]: text } : s.texts, files: addEntry(s.files, { path: p, dir: false, size: new Blob([text]).size, mtime: Date.now() }) });
  return p;
}

/** Save a non-note file (a picture, a PDF) into the vault. */
export async function writeFile(path: string, bytes: Uint8Array) {
  const p = cleanVaultPath(path);
  const res = await fetch(vaultUrl(p), { method: "PUT", body: bytes as Uint8Array<ArrayBuffer> });
  if (!res.ok) throw new Error(`Couldn't save ${p}.`);
  bump({ files: addEntry(ns().files, { path: p, dir: false, size: bytes.length, mtime: Date.now() }) });
  return p;
}

export async function makeFolder(path: string) {
  const p = cleanVaultPath(path);
  if (!p) return "";
  await api("mkdir", { path: p });
  bump({ files: addEntry(ns().files, { path: p, dir: true, size: 0, mtime: 0 }) });
  return p;
}

/** Into the vault's .trash folder (nothing is erased). */
export async function trash(path: string) {
  const p = cleanVaultPath(path);
  await api("trash", { from: p });
  const s = ns();
  const gone = (x: string) => x === p || x.startsWith(`${p}/`);
  bump({ files: s.files.filter((f) => !gone(f.path)), texts: Object.fromEntries(Object.entries(s.texts).filter(([k]) => !gone(k))) });
}

type LinkHit = { wiki: boolean; i: number; len: number; target: string; raw: string; heading: string; alias?: string };

/** Every link (wiki or markdown) that leads to one of these notes. */
function linksTo(targets: Set<string>) {
  const { texts } = ns();
  const notes = vaultIndex().notes;
  const plan: { note: string; hits: LinkHit[] }[] = [];
  for (const n of notes) {
    const text = texts[n] ?? "";
    const hits: LinkHit[] = [];
    for (const m of text.matchAll(WIKI_RE)) {
      const r = resolveIn(notes, m[1], n);
      if (r && targets.has(r)) hits.push({ wiki: true, i: m.index!, len: m[0].length, target: r, raw: m[1].trim(), heading: m[2] || "", alias: m[3] });
    }
    for (const m of text.matchAll(MD_LINK_RE)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(m[1])) continue;
      let t = m[1];
      try {
        t = decodeURIComponent(m[1]);
      } catch {
        /* as written */
      }
      const r = resolveIn(notes, t, n);
      if (r && targets.has(r)) hits.push({ wiki: false, i: m.index!, len: m[0].length, target: r, raw: m[1], heading: m[2] || "" });
    }
    if (hits.length) plan.push({ note: n, hits });
  }
  return plan;
}

/**
 * Rename or move a note or folder. Links that lead to what moved are rewritten (keeping #headings
 * and |labels); a link by name that still finds its note is left as written.
 */
export async function movePath(from: string, to: string): Promise<{ notes: number; links: number }> {
  const a = cleanVaultPath(from);
  const b = cleanVaultPath(to);
  if (!a || !b || a === b) return { notes: 0, links: 0 };
  const s0 = ns();
  const isDir = s0.files.some((f) => f.path === a && f.dir);
  const moved = new Map<string, string>();
  for (const n of Object.keys(s0.texts)) {
    if (n === a) moved.set(n, b);
    else if (isDir && n.startsWith(`${a}/`)) moved.set(n, b + n.slice(a.length));
  }
  const plan = linksTo(new Set(moved.keys()));
  await api("move", { from: a, to: b });
  const re = (p: string) => (p === a ? b : p.startsWith(`${a}/`) ? b + p.slice(a.length) : p);
  bump({
    files: s0.files.map((f) => ({ ...f, path: re(f.path) })),
    texts: Object.fromEntries(Object.entries(s0.texts).map(([k, v]) => [re(k), v])),
  });
  let notes = 0;
  let links = 0;
  const notesNow = vaultIndex().notes;
  for (const { note, hits } of plan) {
    const at = moved.get(note) ?? note;
    let text = ns().texts[at];
    if (text === undefined) continue;
    let changed = false;
    for (const h of hits.sort((x, y) => y.i - x.i)) {
      const dest = moved.get(h.target);
      if (!dest) continue;
      let next: string;
      if (h.wiki) {
        if (!h.raw.includes("/") && resolveIn(notesNow, h.raw, at) === dest) continue;
        const name = h.raw.includes("/") ? dest.replace(/\.(md|markdown)$/i, "") : linkName(dest);
        next = `[[${name}${h.heading}${h.alias != null ? `|${h.alias}` : ""}]]`;
      } else next = `](/${encodeURI(dest)}${h.heading})`;
      if (text.slice(h.i, h.i + h.len) === next) continue;
      text = text.slice(0, h.i) + next + text.slice(h.i + h.len);
      changed = true;
      links++;
    }
    if (changed) {
      await writeNote(at, text);
      notes++;
    }
  }
  return { notes, links };
}

/** Folders with nothing in them (deepest first), apart from attachments and templates. */
export function emptyFolders(keep: string[] = []) {
  const { files } = ns();
  const kept = (d: string) => d === "attachments" || keep.some((k) => k && (d === k || k.startsWith(`${d}/`)));
  return files
    .filter((f) => f.dir && !kept(f.path) && !files.some((x) => !x.dir && x.path.startsWith(`${f.path}/`)))
    .map((f) => f.path)
    .sort((a, b) => b.length - a.length);
}

export async function removeFolder(path: string) {
  await api("rmdir", { path });
  bump({ files: ns().files.filter((f) => f.path !== path) });
}

/** Tidy: remove every empty folder. */
export async function tidy(keep: string[] = []) {
  let n = 0;
  for (const d of emptyFolders(keep)) {
    try {
      await removeFolder(d);
      n++;
    } catch {
      /* something landed in it meanwhile */
    }
  }
  return n;
}
