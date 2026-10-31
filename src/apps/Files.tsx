import { useEffect, useMemo, useState } from "react";
import { Eye, FilePlus, Pencil, Trash2, Type } from "lucide-react";
import { desk, useDesk } from "../lib/store.ts";
import { cleanPath } from "../lib/tools.ts";
import { Confirm, Markdown } from "../ui/common.tsx";
import { useWidth } from "../ui/hooks.ts";
import { openMenu } from "../ui/ContextMenu.tsx";
import { copyText } from "../lib/clipboard.ts";
import { askText } from "../ui/Ask.tsx";

export function CharacterPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  useDesk((s) => s.custom.length + (s.adultOpen ? 1 : 0));
  const chars = useDesk.getState().visibleCharacters();
  return (
    <select className="select" style={{ width: "auto" }} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Whose files">
      {chars.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

const PINNED = ["SOUL.md", "AGENTS.md", "MEMORY.md"];

export function FilesApp() {
  const s = useDesk();
  const [ref, width] = useWidth<HTMLDivElement>();
  const [charId, setCharId] = useState(() => sessionStorage.getItem("pdd-files-char") || s.focus || "dee");
  const tree = s.filesOf(charId);
  const paths = useMemo(() => Object.keys(tree).filter((p) => !p.endsWith(".keep")).sort((a, b) => {
    const pa = PINNED.indexOf(a);
    const pb = PINNED.indexOf(b);
    if (pa >= 0 || pb >= 0) return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
    return a.localeCompare(b);
  }), [tree]);
  const [path, setPath] = useState("SOUL.md");
  const [mode, setMode] = useState<"edit" | "read">("read");
  const [ask, setAsk] = useState<"delete" | null>(null);
  const current = tree[path] !== undefined ? path : paths[0] ?? "";

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ char?: string; path?: string }>).detail;
      if (d?.char) setCharId(d.char);
      if (d?.path) setPath(d.path);
    };
    window.addEventListener("pdd-files", on);
    return () => window.removeEventListener("pdd-files", on);
  }, []);

  const folders = new Map<string, string[]>();
  for (const p of paths) {
    const dir = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
    folders.set(dir, [...(folders.get(dir) ?? []), p]);
  }

  const newFile = async () => {
    const name = await askText("New file name", "notes/new note.md", { body: "Folders with /, e.g. notes/ideas.md" });
    const clean = name ? cleanPath(name) : "";
    if (!clean) return;
    const full = /\.\w+$/.test(clean) ? clean : `${clean}.md`;
    if (tree[full] === undefined) desk().writeFile(charId, full, `# ${full.split("/").pop()!.replace(/\.md$/, "")}\n\n`);
    setPath(full);
    setMode("edit");
  };
  const rename = async () => {
    const to = await askText("Rename to", current);
    const clean = to ? cleanPath(to) : "";
    if (!clean || clean === current) return;
    if (tree[clean] !== undefined) return desk().say("A file with that name already exists.");
    desk().renameFile(charId, current, clean);
    setPath(clean);
  };
  const isMd = /\.md$/i.test(current);

  return (
    <div ref={ref} className={`split${width < 560 ? " narrow" : ""}`}>
      <aside className="side">
        <div className="toolbar">
          <CharacterPicker value={charId} onChange={(id) => (setCharId(id), setPath("SOUL.md"))} />
        </div>
        <div className="list">
          {[...folders.entries()].map(([dir, list]) => (
            <div key={dir}>
              {dir ? <div className="folder">{dir}</div> : null}
              {list.map((p) => (
                <button
                  key={p}
                  className={`item${p === current ? " on" : ""}`}
                  onClick={() => setPath(p)}
                  onContextMenu={(e) =>
                    openMenu(e, [
                      { heading: p },
                      { label: "Open", run: () => setPath(p) },
                      { label: "Edit", run: () => (setPath(p), setMode("edit")) },
                      { label: "Copy its text", run: () => void copyText(tree[p] ?? "") },
                      { label: "Rename…", run: () => (setPath(p), setTimeout(rename, 0)) },
                      { sep: true },
                      { label: "New file…", run: newFile },
                      { sep: true },
                      { label: "Delete…", danger: true, run: () => (setPath(p), setAsk("delete")) },
                    ])
                  }
                  title={p}
                >
                  {p.split("/").pop()}
                </button>
              ))}
            </div>
          ))}
        </div>
      </aside>
      <section className="main">
        <div className="toolbar">
          <b className="grow mono small" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {current || "No files"}
          </b>
          {isMd ? (
            <button className={`icon-btn${mode === "read" ? " on" : ""}`} data-tip={mode === "read" ? "Edit" : "Read"} aria-label="Toggle edit" onClick={() => setMode(mode === "read" ? "edit" : "read")}>
              {mode === "read" ? <Type size={15} /> : <Eye size={15} />}
            </button>
          ) : null}
          <button className="icon-btn" data-tip="New file" aria-label="New file" onClick={newFile}>
            <FilePlus size={15} />
          </button>
          <button className="icon-btn" data-tip="Rename" aria-label="Rename" disabled={!current} onClick={rename}>
            <Pencil size={15} />
          </button>
          <button className="icon-btn" data-tip="Delete" aria-label="Delete" disabled={!current} onClick={() => setAsk("delete")}>
            <Trash2 size={15} />
          </button>
        </div>
        {current && PINNED.includes(current) ? (
          <div className="small muted" style={{ padding: "6px 16px", borderBottom: "1px solid var(--line)" }}>
            {current === "SOUL.md"
              ? "Who they are. Read at the start of every conversation."
              : current === "AGENTS.md"
                ? "How they carry themselves here. Read every conversation."
                : "Their memory. Read every conversation; they add to it with “remember”."}
          </div>
        ) : null}
        {!current ? (
          <div className="empty">No files yet.</div>
        ) : mode === "read" && isMd ? (
          <div className="preview" onDoubleClick={() => setMode("edit")}>
            <Markdown text={tree[current]} />
          </div>
        ) : (
          <textarea className="editor" value={tree[current]} spellCheck={isMd} onChange={(e) => desk().writeFile(charId, current, e.target.value)} aria-label={current} />
        )}
      </section>
      {ask ? (
        <Confirm
          title={`Delete ${current}?`}
          body={<p>This can't be undone (unless you saved a backup).</p>}
          yes="Delete"
          danger
          onYes={() => desk().deleteFile(charId, current)}
          onClose={() => setAsk(null)}
        />
      ) : null}
    </div>
  );
}
