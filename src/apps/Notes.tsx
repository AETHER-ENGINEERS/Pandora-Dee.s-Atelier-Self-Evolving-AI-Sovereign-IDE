import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bold,
  Braces,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Code,
  FilePlus2,
  FileText,
  FolderPlus,
  Folder,
  Hash,
  Heading1,
  Heading2,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Network,
  PanelRight,
  Quote,
  RefreshCw,
  Sigma,
  Strikethrough,
  Table,
  Upload,
  Brush,
  Replace,
  X,
} from "lucide-react";
import { desk, useDesk } from "../lib/store.ts";
import {
  allTasks,
  baseOf,
  cleanVaultPath,
  freePath,
  isNote,
  linkName,
  loadNotes,
  makeFolder,
  movePath,
  noteName,
  noteTags,
  parentOf,
  parseYaml,
  resolveNote,
  safeTitle,
  searchNotes,
  splitFrontmatter,
  tidy,
  toggleTaskText,
  trash,
  useNotes,
  vaultIndex,
  vaultUrl,
  writeFile,
  writeNote,
} from "../lib/notes.ts";
import { applyTemplate, formatDate } from "../lib/templates.ts";
import { importNotes } from "../lib/notesImport.ts";
import { pdfText } from "../lib/pdf.ts";
import { STARTER } from "../lib/notesSeed.ts";
import { Markdown, Seg } from "../ui/common.tsx";
import { useWidth } from "../ui/hooks.ts";
import { openMenu, openMenuAt, type MenuItem } from "../ui/ContextMenu.tsx";
import { askUser } from "../ui/Ask.tsx";
import type { NoteRequest } from "../ui/noteNav.ts";
import { NoteGraph } from "./NoteGraph.tsx";
import { copyText } from "../lib/clipboard.ts";
import { askText } from "../ui/Ask.tsx";

type Tab = "files" | "search" | "tags" | "tasks";
const toast = (t: string) => desk().say(t);
const setPrefs = (p: Partial<ReturnType<typeof desk>["notes"]>) => desk().set({ notes: { ...desk().notes, ...p } });

function useOpenDirs() {
  const [dirs, setDirs] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("pdd-notes-dirs") || "[]") as string[]);
    } catch {
      return new Set();
    }
  });
  const toggle = useCallback((d: string, on?: boolean) => {
    setDirs((prev) => {
      const next = new Set(prev);
      if (on ?? !next.has(d)) for (let p = d; p; p = parentOf(p)) next.add(p);
      else next.delete(d);
      try {
        localStorage.setItem("pdd-notes-dirs", JSON.stringify([...next]));
      } catch {
        /* fine */
      }
      return next;
    });
  }, []);
  return [dirs, toggle] as const;
}

/** Folder → its notes and folders, for the tree. */
function treeOf(files: { path: string; dir: boolean }[]) {
  const kids = new Map<string, { dirs: string[]; notes: string[] }>();
  const slot = (d: string) => kids.get(d) ?? (kids.set(d, { dirs: [], notes: [] }), kids.get(d)!);
  slot("");
  for (const f of files) {
    if (f.path.startsWith("attachments/") && !f.dir && !isNote(f.path)) continue;
    const parent = parentOf(f.path);
    if (f.dir) {
      slot(parent).dirs.push(f.path);
      slot(f.path);
    } else if (isNote(f.path)) slot(parent).notes.push(f.path);
  }
  for (const v of kids.values()) {
    v.dirs.sort((a, b) => a.localeCompare(b));
    v.notes.sort((a, b) => noteName(a).localeCompare(noteName(b)));
  }
  return kids;
}

const FORMATS: { icon: React.ReactNode; label: string; wrap?: [string, string]; line?: string; block?: string }[] = [
  { icon: <Heading1 size={14} />, label: "Heading", line: "# " },
  { icon: <Heading2 size={14} />, label: "Subheading", line: "## " },
  { icon: <Bold size={14} />, label: "Bold", wrap: ["**", "**"] },
  { icon: <Italic size={14} />, label: "Italic", wrap: ["*", "*"] },
  { icon: <Strikethrough size={14} />, label: "Strike", wrap: ["~~", "~~"] },
  { icon: <Code size={14} />, label: "Code", wrap: ["`", "`"] },
  { icon: <Link2 size={14} />, label: "Link to a note", wrap: ["[[", "]]"] },
  { icon: <Hash size={14} />, label: "Tag", wrap: ["#", ""] },
  { icon: <List size={14} />, label: "List", line: "- " },
  { icon: <ListOrdered size={14} />, label: "Numbered list", line: "1. " },
  { icon: <ListChecks size={14} />, label: "Task", line: "- [ ] " },
  { icon: <Quote size={14} />, label: "Quote", line: "> " },
  { icon: <Braces size={14} />, label: "Code block", wrap: ["```\n", "\n```"] },
  { icon: <Sigma size={14} />, label: "Math", wrap: ["$", "$"] },
  { icon: <Table size={14} />, label: "Table", block: "| Column | Column |\n| --- | --- |\n|  |  |\n" },
];

export function NotesApp() {
  const notes = useNotes();
  const prefs = useDesk((s) => s.notes);
  const [ref, width] = useWidth<HTMLDivElement>();
  const [open, setOpenRaw] = useState<string | null>(() => sessionStorage.getItem("pdd-note-current"));
  const [tab, setTab] = useState<Tab>("files");
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [graph, setGraph] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [dirs, toggleDir] = useOpenDirs();
  const [busy, setBusy] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const narrow = width < 760;
  const [sideOpen, setSideOpen] = useState(true);

  const setOpen = useCallback((p: string | null) => {
    setOpenRaw(p);
    setGraph(false);
    if (p) {
      sessionStorage.setItem("pdd-note-current", p);
      toggleDir(parentOf(p), true);
    } else sessionStorage.removeItem("pdd-note-current");
  }, [toggleDir]);

  useEffect(() => void loadNotes(), []);

  // An empty vault gets the starter notes, once.
  useEffect(() => {
    if (!notes.loaded || prefs.seeded) return;
    setPrefs({ seeded: true });
    if (Object.keys(notes.texts).length) return;
    void (async () => {
      for (const [p, t] of Object.entries(STARTER)) await writeNote(p, t);
      setOpen("Welcome.md");
    })();
  }, [notes.loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  /** A note that doesn't exist yet: create it beside the one that linked to it. */
  const createFor = useCallback(
    async (target: string, from?: string) => {
      const t = target.trim();
      const p = t.includes("/") ? `${cleanVaultPath(t).replace(/\.(md|markdown)$/i, "")}.md` : freePath(from ? parentOf(from) : "", t);
      await writeNote(p, `# ${noteName(p)}\n\n`);
      setOpen(p);
      return p;
    },
    [setOpen],
  );

  // Requests from links, tags and characters.
  useEffect(() => {
    const handle = (req: NoteRequest) => {
      if (req.tag) {
        setTab("tags");
        setTagFilter(req.tag);
        setSideOpen(true);
        return;
      }
      if (!req.target) return;
      const r = resolveNote(req.target, req.from);
      if (r) setOpen(r);
      else if (req.create) void createFor(req.target, req.from);
    };
    const pending = sessionStorage.getItem("pdd-note-open");
    if (pending && notes.loaded) {
      sessionStorage.removeItem("pdd-note-open");
      try {
        handle(JSON.parse(pending) as NoteRequest);
      } catch {
        /* ignore */
      }
    }
    const on = (e: Event) => {
      sessionStorage.removeItem("pdd-note-open");
      handle((e as CustomEvent<NoteRequest>).detail);
    };
    window.addEventListener("pdd-note", on);
    return () => window.removeEventListener("pdd-note", on);
  }, [notes.loaded, createFor, setOpen]);

  const tree = useMemo(() => treeOf(notes.files), [notes.files]);
  const idx = useMemo(() => vaultIndex(), [notes.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const folderOfOpen = open ? parentOf(open) : "";

  const newNote = async (dir = folderOfOpen) => {
    const p = freePath(dir, "Untitled");
    await writeNote(p, "# Untitled\n\n");
    setOpen(p);
    setPrefs({ view: prefs.view === "read" ? "split" : prefs.view });
  };
  const newFolder = async (dir = folderOfOpen) => {
    const name = await askText("Name the new folder", "");
    if (!name?.trim()) return;
    const p = await makeFolder(dir ? `${dir}/${safeTitle(name)}` : safeTitle(name));
    toggleDir(p, true);
  };
  const today = async () => {
    const p = `${cleanVaultPath(prefs.daily) || "Daily"}/${formatDate(new Date(), prefs.dailyFormat || "YYYY-MM-DD")}.md`;
    if (!notes.texts[p]) {
      const tplPath = prefs.dailyTemplate || `${prefs.templates}/Daily note.md`;
      const tpl = notes.texts[cleanVaultPath(tplPath)];
      const text = tpl ? applyTemplate(tpl, { title: noteName(p), folder: parentOf(p), path: p }).text : `# ${noteName(p)}\n\n`;
      await writeNote(p, text);
    }
    setOpen(p);
  };
  const rename = async (p: string) => {
    const isDir = notes.files.some((f) => f.path === p && f.dir);
    const now = isDir ? baseOf(p) : noteName(p);
    const name = await askText(isDir ? "Rename the folder" : "Rename the note", now, isDir ? {} : { body: "Use a / to move it into a folder." });
    if (!name?.trim() || name.trim() === now) return;
    const clean = name.trim().includes("/") ? cleanVaultPath(name) : `${parentOf(p) ? `${parentOf(p)}/` : ""}${safeTitle(name)}`;
    const to = isDir ? clean : `${clean.replace(/\.(md|markdown)$/i, "")}.md`;
    try {
      const r = await movePath(p, to);
      if (!isDir && open === p) setOpen(to);
      if (isDir && open?.startsWith(`${p}/`)) setOpen(to + open.slice(p.length));
      toast(r.links ? `Renamed. ${r.links} link${r.links === 1 ? "" : "s"} in ${r.notes} note${r.notes === 1 ? "" : "s"} now point there.` : "Renamed.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't rename that.");
    }
  };
  const remove = async (p: string) => {
    const isDir = notes.files.some((f) => f.path === p && f.dir);
    const inside = isDir ? notes.files.filter((f) => !f.dir && f.path.startsWith(`${p}/`)).length : 0;
    const ok = await askUser(
      isDir ? `Delete the folder ${baseOf(p)}?` : `Delete ${noteName(p)}?`,
      `${isDir && inside ? `It holds ${inside} file${inside === 1 ? "" : "s"}. ` : ""}It moves to the vault's .trash folder, so you can still get it back from there.`,
      "Delete",
      "Keep",
    );
    if (!ok) return;
    await trash(p);
    if (open && (open === p || open.startsWith(`${p}/`))) setOpen(null);
  };
  const runImport = async (files: File[]) => {
    if (!files.length) return;
    setBusy(`Importing ${files.length} file${files.length === 1 ? "" : "s"}…`);
    try {
      const r = await importNotes(files);
      toast(r.notes ? `Imported ${r.notes} note${r.notes === 1 ? "" : "s"}${r.skipped.length ? `; ${r.skipped.length} couldn't be, see the report` : ""}.` : r.skipped[0] ?? "Nothing to import.");
      for (const d of r.folders) toggleDir(d, true);
      if (r.report) setOpen(r.report);
    } finally {
      setBusy("");
    }
  };

  const treeMenu = (p: string, dir: boolean): MenuItem[] => [
    ...(dir
      ? [
          { label: "New note here", run: () => void newNote(p) },
          { label: "New folder here", run: () => void newFolder(p) },
        ]
      : [{ label: "Open", run: () => setOpen(p) }, { label: "Copy link", run: () => void copyText(`[[${linkName(p)}]]`) }]),
    { sep: true },
    { label: "Rename or move…", run: () => void rename(p) },
    { label: "Delete…", danger: true, run: () => void remove(p) },
  ];

  const renderDir = (d: string, depth: number): React.ReactNode => {
    const k = tree.get(d);
    if (!k) return null;
    return (
      <>
        {k.dirs.map((sub) => (
          <div key={sub}>
            <button
              className="item tree-dir"
              style={{ paddingLeft: 6 + depth * 12 }}
              onClick={() => toggleDir(sub)}
              onContextMenu={(e) => openMenu(e, treeMenu(sub, true))}
              aria-expanded={dirs.has(sub)}
            >
              {dirs.has(sub) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <Folder size={13} className="faint" />
              {baseOf(sub)}
            </button>
            {dirs.has(sub) ? renderDir(sub, depth + 1) : null}
          </div>
        ))}
        {k.notes.map((p) => (
          <button
            key={p}
            className={`item${open === p ? " on" : ""}`}
            style={{ paddingLeft: 20 + depth * 12 }}
            onClick={() => (setOpen(p), narrow && setSideOpen(false))}
            onContextMenu={(e) => openMenu(e, treeMenu(p, false))}
            title={p}
          >
            <FileText size={13} className="faint" />
            {noteName(p)}
          </button>
        ))}
      </>
    );
  };

  const tagList = useMemo(() => [...idx.tags.entries()].map(([t, s]) => [t, s.size] as const).sort((a, b) => a[0].localeCompare(b[0])), [idx]);
  const hits = useMemo(() => (tab === "search" ? searchNotes(query, 60) : []), [tab, query, idx]); // eslint-disable-line react-hooks/exhaustive-deps
  const tasks = useMemo(() => (tab === "tasks" ? allTasks(!showDone, [prefs.templates]) : []), [tab, showDone, idx]); // eslint-disable-line react-hooks/exhaustive-deps

  const side = (
    <aside className="side notes-side">
      <div className="notes-tools">
        <button className="icon-btn" data-tip="New note" aria-label="New note" onClick={() => void newNote()}>
          <FilePlus2 size={15} />
        </button>
        <button className="icon-btn" data-tip="New folder" aria-label="New folder" onClick={() => void newFolder()}>
          <FolderPlus size={15} />
        </button>
        <button className="icon-btn" data-tip="Today's daily note" aria-label="Today's daily note" onClick={() => void today()}>
          <CalendarDays size={15} />
        </button>
        <button className={`icon-btn${graph ? " on" : ""}`} data-tip="Graph of all notes" aria-label="Graph" aria-pressed={graph} onClick={() => setGraph(!graph)}>
          <Network size={15} />
        </button>
        <button className="icon-btn" data-tip="Import from Google Keep, Samsung Notes, Apple Notes, Word, PDF, HTML, text or a .zip" aria-label="Import notes" onClick={() => importRef.current?.click()}>
          <Upload size={15} />
        </button>
        <button
          className="icon-btn"
          data-tip="Tidy: remove empty folders"
          aria-label="Tidy"
          onClick={() => void tidy([prefs.templates, prefs.daily]).then((n) => toast(n ? `Removed ${n} empty folder${n === 1 ? "" : "s"}.` : "No empty folders."))}
        >
          <Brush size={15} />
        </button>
        <button className="icon-btn" data-tip="Read the vault again (after changing files outside the desktop)" aria-label="Reload notes" onClick={() => void loadNotes(true)}>
          <RefreshCw size={15} />
        </button>
        <input
          ref={importRef}
          type="file"
          multiple
          hidden
          accept=".zip,.json,.html,.htm,.docx,.pdf,.md,.markdown,.txt,.sdocx"
          onChange={(e) => {
            void runImport([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </div>
      <div className="notes-tabs" role="tablist">
        {(["files", "search", "tags", "tasks"] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t === "files" ? "Files" : t === "search" ? "Search" : t === "tags" ? "Tags" : "Tasks"}
          </button>
        ))}
      </div>
      {busy ? <div className="small muted" style={{ padding: "4px 10px" }}>{busy}</div> : null}
      <div className="list">
        {!notes.loaded ? <div className="small muted">{notes.error || "Reading your notes…"}</div> : null}
        {tab === "files" ? (
          <div onContextMenu={(e) => e.target === e.currentTarget && openMenu(e, treeMenu("", true).slice(0, 2))} style={{ minHeight: "100%" }}>
            {renderDir("", 0)}
          </div>
        ) : null}
        {tab === "search" ? (
          <>
            <input className="input" autoFocus placeholder="Words, or #tag" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search notes" />
            {hits.map((h) => (
              <button key={h.path} className={`hit${open === h.path ? " on" : ""}`} onClick={() => setOpen(h.path)}>
                <b>{noteName(h.path)}</b>
                <span className="faint small">{parentOf(h.path)}</span>
                <span className="small muted">{h.snippet}</span>
              </button>
            ))}
            {query.trim() && !hits.length ? <div className="small muted" style={{ padding: 8 }}>Nothing matches.</div> : null}
          </>
        ) : null}
        {tab === "tags" ? (
          tagFilter ? (
            <>
              <button className="item" onClick={() => setTagFilter("")}>
                <X size={13} /> #{tagFilter}
              </button>
              {[...idx.tags.entries()]
                .filter(([t]) => t === tagFilter || t.startsWith(`${tagFilter}/`))
                .flatMap(([, s]) => [...s])
                .filter((p, i, a) => a.indexOf(p) === i)
                .sort()
                .map((p) => (
                  <button key={p} className={`item${open === p ? " on" : ""}`} onClick={() => setOpen(p)}>
                    <FileText size={13} className="faint" /> {noteName(p)}
                  </button>
                ))}
            </>
          ) : (
            tagList.map(([t, n]) => (
              <button key={t} className="item" style={{ paddingLeft: 8 + (t.split("/").length - 1) * 12 }} onClick={() => setTagFilter(t)}>
                <Hash size={12} className="faint" /> {t.split("/").pop()} <span className="faint small">{n}</span>
              </button>
            ))
          )
        ) : null}
        {tab === "tasks" ? (
          <>
            <label className="check small" style={{ padding: "2px 6px" }}>
              <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
              <span>Show done</span>
            </label>
            {tasks.length ? null : <div className="small muted" style={{ padding: 8 }}>{showDone ? "No tasks in your notes." : "Nothing open. Well done."}</div>}
            {tasks.map((t) => (
              <label key={`${t.path}:${t.line}`} className="task-row">
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={(e) => void writeNote(t.path, toggleTaskText(useNotes.getState().texts[t.path] ?? "", t.n, e.target.checked))}
                />
                <span>
                  {t.text}
                  <button className="link small faint" onClick={(e) => (e.preventDefault(), setOpen(t.path))}>
                    {noteName(t.path)}
                  </button>
                </span>
              </label>
            ))}
          </>
        ) : null}
      </div>
    </aside>
  );

  return (
    <div
      ref={ref}
      className={`split notes${narrow ? " narrow" : ""}`}
      onDragOver={(e) => [...e.dataTransfer.types].includes("Files") && !open && e.preventDefault()}
      onDrop={(e) => {
        if (open || !e.dataTransfer.files.length) return;
        e.preventDefault();
        void runImport([...e.dataTransfer.files]);
      }}
    >
      {!narrow || sideOpen ? side : null}
      <section className="notes-main">
        {narrow ? (
          <button className="btn small notes-side-toggle" onClick={() => setSideOpen(!sideOpen)}>
            {sideOpen ? "Hide list" : "Notes list"}
          </button>
        ) : null}
        {graph ? (
          <NoteGraph onOpen={(p) => setOpen(p)} />
        ) : open && notes.texts[open] !== undefined ? (
          <NoteView key={open} path={open} narrow={narrow} onOpen={setOpen} onRename={() => void rename(open)} onDelete={() => void remove(open)} createFor={createFor} />
        ) : (
          <div className="empty">
            <p>{notes.loaded ? (Object.keys(notes.texts).length ? "Pick a note, or start a new one." : "No notes yet.") : "Reading your notes…"}</p>
            <div className="row" style={{ justifyContent: "center", gap: 8 }}>
              <button className="btn primary" onClick={() => void newNote("")}>
                New note
              </button>
              <button className="btn" onClick={() => void today()}>
                Today's note
              </button>
              <button className="btn" onClick={() => importRef.current?.click()}>
                Import…
              </button>
            </div>
            <p className="small faint" style={{ marginTop: 10 }}>
              Drop Google Keep, Samsung Notes or Apple Notes exports, Word, PDF, HTML or text files here to bring them in.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function NoteView({
  path,
  narrow,
  onOpen,
  onRename,
  onDelete,
  createFor,
}: {
  path: string;
  narrow: boolean;
  onOpen: (p: string) => void;
  onRename: () => void;
  onDelete: () => void;
  createFor: (target: string, from?: string) => Promise<string>;
}) {
  const stored = useNotes((s) => s.texts[path] ?? "");
  const prefs = useDesk((s) => s.notes);
  const [text, setText] = useState(stored);
  const dirty = useRef(false);
  const timer = useRef(0);
  const area = useRef<HTMLTextAreaElement>(null);
  const [suggest, setSuggest] = useState<{ q: string; at: number; pick: number } | null>(null);
  const [finding, setFinding] = useState(false);
  const view = narrow && prefs.view === "split" ? "edit" : prefs.view;

  // Someone else (a character, an import) changed it while we weren't typing.
  useEffect(() => {
    if (!dirty.current) setText(stored);
  }, [stored]);

  const save = useCallback(
    (next: string) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        dirty.current = false;
        void writeNote(path, next).catch((e) => toast(e instanceof Error ? e.message : "Couldn't save."));
      }, 600);
    },
    [path],
  );
  useEffect(
    () => () => {
      // leaving the note: save what's pending at once
      if (dirty.current) {
        window.clearTimeout(timer.current);
        void writeNote(path, area.current?.value ?? "");
      }
    },
    [path],
  );

  const change = (next: string) => {
    dirty.current = true;
    setText(next);
    save(next);
  };

  /** Replace the selection (or insert at the cursor) and put the cursor after `before + selection`. */
  const edit = (fn: (sel: string) => { insert: string; caret?: number }) => {
    const el = area.current;
    if (!el) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const { insert, caret } = fn(text.slice(s, e));
    const next = text.slice(0, s) + insert + text.slice(e);
    change(next);
    requestAnimationFrame(() => {
      el.focus();
      const at = s + (caret ?? insert.length);
      el.setSelectionRange(at, at);
    });
  };
  const format = (f: (typeof FORMATS)[number]) => {
    const el = area.current;
    if (!el) return;
    if (f.line) {
      // add the prefix to every selected line
      const s = text.lastIndexOf("\n", el.selectionStart - 1) + 1;
      const e = el.selectionEnd;
      const lines = text.slice(s, e).split("\n");
      const insert = lines.map((l) => (l.startsWith(f.line!) ? l.slice(f.line!.length) : f.line + l)).join("\n");
      change(text.slice(0, s) + insert + text.slice(e));
      requestAnimationFrame(() => (el.focus(), el.setSelectionRange(s + insert.length, s + insert.length)));
    } else if (f.wrap) edit((sel) => ({ insert: f.wrap![0] + sel + f.wrap![1], caret: f.wrap![0].length + sel.length }));
    else if (f.block) edit(() => ({ insert: `\n${f.block}` }));
  };

  // [[ suggestions
  const onInput = (next: string, caret: number) => {
    change(next);
    const before = next.slice(0, caret);
    const m = /\[\[([^\]\n|#]*)$/.exec(before);
    setSuggest(m ? { q: m[1], at: caret - m[1].length, pick: 0 } : null);
  };
  const options = useMemo(() => {
    if (!suggest) return [];
    const q = suggest.q.toLowerCase();
    return vaultIndex()
      .notes.filter((p) => p !== path && (noteName(p).toLowerCase().includes(q) || p.toLowerCase().includes(q)))
      .sort((a, b) => Number(!noteName(a).toLowerCase().startsWith(q)) - Number(!noteName(b).toLowerCase().startsWith(q)) || a.length - b.length)
      .slice(0, 8);
  }, [suggest, path]);
  const choose = (p: string) => {
    const el = area.current;
    if (!el || !suggest) return;
    const end = el.selectionStart;
    const closes = text.slice(end, end + 2) === "]]";
    const insert = `${linkName(p)}${closes ? "" : "]]"}`;
    const next = text.slice(0, suggest.at) + insert + text.slice(end);
    change(next);
    setSuggest(null);
    const at = suggest.at + insert.length + (closes ? 2 : 0);
    requestAnimationFrame(() => (el.focus(), el.setSelectionRange(at, at)));
  };

  // pictures and files pasted or dropped into the editor go to attachments/
  const attach = async (files: File[]) => {
    const parts: string[] = [];
    for (const f of files) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const name = f.name || `pasted-${Date.now()}.${(f.type.split("/")[1] || "bin").replace("jpeg", "jpg")}`;
      const dot = name.lastIndexOf(".");
      const p = freePath("attachments", dot > 0 ? name.slice(0, dot) : name, dot > 0 ? name.slice(dot) : "");
      await writeFile(p, bytes);
      if (f.type.startsWith("image/")) parts.push(`![[${p}]]`);
      else if (/pdf/i.test(f.type) || /\.pdf$/i.test(name)) {
        parts.push(`[${baseOf(p)}](/${encodeURI(p)})`);
        try {
          const r = await pdfText(bytes);
          if (r.text.replace(/<!--.*?-->|\s/g, "").length > 20) {
            const note = await writeNote(`${p}.md`, `---\nsource: ${p}\npages: ${r.pages}\n---\n# ${baseOf(p)}\n\n${r.text}\n`);
            parts.push(`([[${note.replace(/\.md$/, "")}|text of the PDF]])`);
          }
        } catch {
          toast("The PDF was saved, but its text couldn't be read.");
        }
      } else parts.push(`[${baseOf(p)}](/${encodeURI(p)})`);
    }
    if (parts.length) edit(() => ({ insert: parts.join("\n") }));
  };

  const insertTemplate = (tplPath: string) => {
    const tpl = useNotes.getState().texts[tplPath] ?? "";
    const r = applyTemplate(tpl, { title: noteName(path), folder: parentOf(path), path });
    if (r.skipped) toast("Parts of this template run code, which arrives with the Runtimes batch; those were left out.");
    edit(() => ({ insert: r.text, caret: r.cursor >= 0 ? r.cursor : r.text.length }));
  };
  const templateMenu = (): MenuItem[] => {
    const dir = cleanVaultPath(prefs.templates);
    const list = vaultIndex().notes.filter((p) => p.startsWith(`${dir}/`));
    return list.length
      ? [{ heading: `Templates (${dir})` }, ...list.map((p) => ({ label: noteName(p), run: () => insertTemplate(p) }))]
      : [{ heading: `No templates yet: add notes to ${dir}/` }];
  };

  const toggleTask = (n: number, done: boolean) => {
    const next = toggleTaskText(text, n, done);
    dirty.current = false;
    setText(next);
    void writeNote(path, next);
  };

  const { fm, body } = splitFrontmatter(text);
  const props = useMemo(() => (fm ? parseYaml(fm) : {}), [fm]);
  const idx = vaultIndex();
  const back = [...(idx.back.get(path) ?? [])].sort();
  const out = [...(idx.out.get(path) ?? [])].sort();
  const missing = [...(idx.missing.get(path) ?? [])].sort();
  const tags = noteTags(path);

  const reader = (
    <div className="note-read">
      {Object.keys(props).length ? (
        <table className="note-props">
          <tbody>
            {Object.entries(props).map(([k, v]) => (
              <tr key={k}>
                <th>{k}</th>
                <td>{Array.isArray(v) ? v.join(", ") : v === null ? "" : String(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <Markdown text={body} from={path} onTask={toggleTask} />
    </div>
  );

  const editor = (
    <div className="note-edit">
      <div className="note-format" role="toolbar" aria-label="Formatting">
        {FORMATS.map((f) => (
          <button key={f.label} className="icon-btn" data-tip={f.label} aria-label={f.label} onMouseDown={(e) => e.preventDefault()} onClick={() => format(f)}>
            {f.icon}
          </button>
        ))}
        <button className="icon-btn" data-tip="Insert a template" aria-label="Insert a template" onClick={(e) => openMenuAt(e.currentTarget, templateMenu())}>
          {"{ }"}
        </button>
        <button className={`icon-btn${finding ? " on" : ""}`} data-tip="Find and replace (Ctrl F)" aria-label="Find and replace" onClick={() => setFinding(!finding)}>
          <Replace size={14} />
        </button>
      </div>
      {finding ? <FindBar text={text} area={area} onChange={change} onClose={() => setFinding(false)} /> : null}
      <div className="note-area">
        <textarea
          ref={area}
          value={text}
          spellCheck
          aria-label={`Edit ${noteName(path)}`}
          onChange={(e) => onInput(e.target.value, e.target.selectionStart)}
          onBlur={() => window.setTimeout(() => setSuggest(null), 150)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
              e.preventDefault();
              setFinding(true);
              return;
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === "b" || e.key === "i")) {
              e.preventDefault();
              format(FORMATS.find((f) => f.label === (e.key === "b" ? "Bold" : "Italic"))!);
              return;
            }
            if (suggest && options.length) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setSuggest({ ...suggest, pick: (suggest.pick + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length });
              } else if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                choose(options[suggest.pick]);
              } else if (e.key === "Escape") setSuggest(null);
            }
          }}
          onPaste={(e) => {
            const files = [...e.clipboardData.files];
            if (files.length) {
              e.preventDefault();
              void attach(files);
            }
          }}
          onDrop={(e) => {
            const files = [...e.dataTransfer.files];
            if (files.length) {
              e.preventDefault();
              void attach(files);
            }
          }}
        />
        {suggest && options.length ? (
          <div className="link-suggest" role="listbox" aria-label="Notes to link">
            {options.map((p, i) => (
              <button key={p} role="option" aria-selected={i === suggest.pick} className={i === suggest.pick ? "on" : ""} onMouseDown={(e) => (e.preventDefault(), choose(p))}>
                {noteName(p)} <span className="faint small">{parentOf(p)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className={`note-view${prefs.panel && !narrow ? " with-panel" : ""}`}>
      <header className="note-head">
        <button className="note-title" onClick={onRename} data-tip="Rename or move" aria-label={`Rename ${noteName(path)}`}>
          {noteName(path)}
        </button>
        <span className="faint small note-folder">{parentOf(path) || "vault"}</span>
        <span className="grow" />
        <Seg
          value={view}
          onChange={(v) => setPrefs({ view: v })}
          options={narrow ? [{ id: "edit", label: "Edit" }, { id: "read", label: "Read" }] : [{ id: "edit", label: "Edit" }, { id: "split", label: "Both" }, { id: "read", label: "Read" }]}
        />
        {!narrow ? (
          <button className={`icon-btn${prefs.panel ? " on" : ""}`} data-tip="Links, tags and the local graph" aria-label="Side panel" aria-pressed={prefs.panel} onClick={() => setPrefs({ panel: !prefs.panel })}>
            <PanelRight size={15} />
          </button>
        ) : null}
        <button
          className="icon-btn"
          aria-label="More"
          onClick={(e) =>
            openMenuAt(e.currentTarget, [
              { label: "Copy link", run: () => void copyText(`[[${linkName(path)}]]`) },
              { label: "Rename or move…", run: onRename },
              { label: "Open the file", run: () => window.open(vaultUrl(path), "_blank") },
              { sep: true },
              { label: "Delete…", danger: true, run: onDelete },
            ])
          }
        >
          …
        </button>
      </header>
      <div className={`note-body view-${view}`}>
        {view !== "read" ? editor : null}
        {view !== "edit" ? reader : null}
      </div>
      {prefs.panel && !narrow ? (
        <aside className="note-panel">
          <h5>Links here ({back.length})</h5>
          {back.length ? back.map((p) => <PanelLink key={p} p={p} onOpen={onOpen} />) : <div className="small faint">None yet.</div>}
          <h5>Links from here ({out.length})</h5>
          {out.length ? out.map((p) => <PanelLink key={p} p={p} onOpen={onOpen} />) : <div className="small faint">None.</div>}
          {missing.length ? (
            <>
              <h5>Not written yet ({missing.length})</h5>
              {missing.map((m) => (
                <button key={m} className="panel-link missing" onClick={() => void createFor(m, path)} data-tip="Click to create it">
                  {m}
                </button>
              ))}
            </>
          ) : null}
          {tags.length ? (
            <>
              <h5>Tags</h5>
              <div className="row" style={{ flexWrap: "wrap", gap: 4 }}>
                {tags.map((t) => (
                  <span key={t} className="tag-chip">
                    #{t}
                  </span>
                ))}
              </div>
            </>
          ) : null}
          <h5>Nearby</h5>
          <NoteGraph center={path} onOpen={onOpen} compact />
        </aside>
      ) : null}
    </div>
  );
}

function PanelLink({ p, onOpen }: { p: string; onOpen: (p: string) => void }) {
  return (
    <button className="panel-link" onClick={() => onOpen(p)} title={p}>
      {noteName(p)}
      {parentOf(p) ? <span className="faint small"> · {parentOf(p)}</span> : null}
    </button>
  );
}

function FindBar({ text, area, onChange, onClose }: { text: string; area: React.RefObject<HTMLTextAreaElement | null>; onChange: (t: string) => void; onClose: () => void }) {
  const [find, setFind] = useState("");
  const [repl, setRepl] = useState("");
  const [cased, setCased] = useState(false);
  const [regex, setRegex] = useState(false);
  const pattern = useMemo(() => {
    if (!find) return null;
    try {
      return new RegExp(regex ? find : find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), cased ? "g" : "gi");
    } catch {
      return null;
    }
  }, [find, cased, regex]);
  const matches = useMemo(() => (pattern ? [...text.matchAll(pattern)].filter((m) => m[0].length) : []), [pattern, text]);
  const go = (dir: 1 | -1) => {
    const el = area.current;
    if (!el || !matches.length) return;
    const from = dir === 1 ? el.selectionEnd : el.selectionStart;
    const m = dir === 1 ? matches.find((x) => x.index! >= from) ?? matches[0] : [...matches].reverse().find((x) => x.index! + x[0].length <= from) ?? matches[matches.length - 1];
    el.focus();
    el.setSelectionRange(m.index!, m.index! + m[0].length);
    // bring it into view
    const line = text.slice(0, m.index).split("\n").length;
    el.scrollTop = Math.max(0, (line - 4) * parseFloat(getComputedStyle(el).lineHeight || "20"));
  };
  const replaceOne = () => {
    const el = area.current;
    if (!el || !pattern) return;
    const sel = text.slice(el.selectionStart, el.selectionEnd);
    const one = new RegExp(pattern.source, pattern.flags.replace("g", ""));
    if (sel && one.test(sel) && sel.replace(one, "") === "" ) {
      const start = el.selectionStart;
      const put = sel.replace(one, repl);
      onChange(text.slice(0, start) + put + text.slice(el.selectionEnd));
      requestAnimationFrame(() => (el.setSelectionRange(start + put.length, start + put.length), go(1)));
    } else go(1);
  };
  const replaceAll = () => {
    if (!pattern || !matches.length) return;
    onChange(text.replace(pattern, repl));
    toast(`Replaced ${matches.length}.`);
  };
  return (
    <div className="find-bar" role="search">
      <input
        className="input"
        autoFocus
        placeholder="Find"
        value={find}
        onChange={(e) => setFind(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.preventDefault(), go(e.shiftKey ? -1 : 1));
          if (e.key === "Escape") onClose();
        }}
        aria-label="Find"
      />
      <span className="small faint">{find ? (pattern ? `${matches.length} found` : "not a valid pattern") : ""}</span>
      <input className="input" placeholder="Replace with" value={repl} onChange={(e) => setRepl(e.target.value)} aria-label="Replace with" onKeyDown={(e) => e.key === "Escape" && onClose()} />
      <label className="check small">
        <input type="checkbox" checked={cased} onChange={(e) => setCased(e.target.checked)} />
        <span>Aa</span>
      </label>
      <label className="check small" data-tip="Regular expression">
        <input type="checkbox" checked={regex} onChange={(e) => setRegex(e.target.checked)} />
        <span>.*</span>
      </label>
      <button className="btn small" onClick={() => go(-1)} disabled={!matches.length}>
        Previous
      </button>
      <button className="btn small" onClick={() => go(1)} disabled={!matches.length}>
        Next
      </button>
      <button className="btn small" onClick={replaceOne} disabled={!matches.length}>
        Replace
      </button>
      <button className="btn small" onClick={replaceAll} disabled={!matches.length}>
        All
      </button>
      <button className="icon-btn" aria-label="Close find" onClick={onClose}>
        <X size={14} />
      </button>
    </div>
  );
}
