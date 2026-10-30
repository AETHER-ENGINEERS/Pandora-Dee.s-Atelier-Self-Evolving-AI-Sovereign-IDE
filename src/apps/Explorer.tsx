import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft, Copy, Download, ExternalLink, File as FileIcon, FileText, Folder, FolderPlus, FolderUp, Gamepad2, HardDrive, Image as ImageIcon,
  LayoutGrid, LayoutList, Monitor, Music2, RotateCcw, Share2, Trash2, Upload, Video,
} from "lucide-react";
import { desk } from "../lib/store.ts";
import { Markdown } from "../ui/common.tsx";
import { openMenu, type MenuItem } from "../ui/ContextMenu.tsx";
import { useWidth } from "../ui/hooks.ts";
import {
  answerPick, baseName, dirName, downloadToDevice, fileApi, kindOf, openXdcInGames, pickInExplorer, rawUrl, showOnDevice, sizeOf, usePickRequest,
  type Entry, type Listing, type Overview, type PickOptions, type Trashed,
} from "../lib/explorer.ts";

const ICON: Record<string, (s: number) => React.ReactNode> = {
  folder: (s) => <Folder size={s} />,
  image: (s) => <ImageIcon size={s} />,
  audio: (s) => <Music2 size={s} />,
  video: (s) => <Video size={s} />,
  pdf: (s) => <FileText size={s} />,
  text: (s) => <FileText size={s} />,
  xdc: (s) => <Gamepad2 size={s} />,
  file: (s) => <FileIcon size={s} />,
};
const when = (t: number) => (t ? new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");
const fail = (e: unknown) => desk().say(e instanceof Error ? e.message : String(e));

/** The desktop's file explorer. */
export function ExplorerApp() {
  const [go, setGo] = useState<{ path: string; at: number } | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem("pdd-explorer-go") || "null");
    } catch {
      return null;
    }
  });
  useEffect(() => {
    const on = (e: Event) => setGo((e as CustomEvent<{ path: string; at: number }>).detail);
    window.addEventListener("pdd-explorer", on);
    return () => window.removeEventListener("pdd-explorer", on);
  }, []);
  return <FileBrowser mode="browse" go={go} />;
}

/** Explorer as a dialog: for Vector's file pickers and "save as" (and anything else that asks). */
export function PickerHost() {
  const req = usePickRequest();
  if (!req) return null;
  const title = req.title || (req.mode === "folder" ? "Choose a folder" : req.mode === "save" ? "Save as" : req.multiple ? "Choose files" : "Choose a file");
  return createPortal(
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && answerPick(null)}>
      <div className="dialog explorer-picker" role="dialog" aria-modal="true" aria-label={title}>
        <h3 style={{ margin: "0 0 8px" }}>{title}</h3>
        <FileBrowser key={req.id} mode={req.mode} pick={req} />
      </div>
    </div>,
    document.body,
  );
}

type Mode = "browse" | PickOptions["mode"];

function FileBrowser({ mode, go, pick }: { mode: Mode; go?: { path: string; at: number } | null; pick?: PickOptions }) {
  const [ov, setOv] = useState<Overview | null>(null);
  const [cwd, setCwd] = useState<string>(() => localStorage.getItem("pdd-explorer-cwd") || "");
  const [listing, setListing] = useState<Listing | null>(null);
  const [trashView, setTrashView] = useState(false);
  const [trashed, setTrashed] = useState<Trashed[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [view, setView] = useState<"list" | "grid">(() => (localStorage.getItem("pdd-explorer-view") === "grid" ? "grid" : "list"));
  const [saveName, setSaveName] = useState(pick?.defaultName ?? "");
  const [dropping, setDropping] = useState(false);
  const history = useRef<string[]>([]);
  const uploader = useRef<HTMLInputElement>(null);
  const [ref, width] = useWidth<HTMLDivElement>();
  const narrow = width > 0 && width < 640;
  const picking = mode !== "browse";

  const loadOverview = useCallback(() => fileApi.overview().then(setOv, fail), []);
  useEffect(() => void loadOverview(), [loadOverview]);

  const open = useCallback(
    async (p: string, selectName?: string, remember = true) => {
      try {
        const l = await fileApi.list(p);
        if (remember && cwd && cwd !== l.path) history.current.push(cwd);
        setListing(l);
        setCwd(l.path);
        setTrashView(false);
        setError("");
        setSel(selectName ? [l.entries.find((e) => e.name === selectName)?.path ?? ""].filter(Boolean) : []);
        if (!picking) localStorage.setItem("pdd-explorer-cwd", l.path);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [cwd, picking],
  );
  const refresh = () => (trashView ? fileApi.trashList().then(setTrashed, fail) : cwd ? open(cwd, undefined, false) : undefined);

  // first folder: where we were sent, or the last one, or the vault
  useEffect(() => {
    if (!ov || listing) return;
    void open(cwd || ov.places[0]?.path || "", undefined, false).then(undefined, () => ov.places[0] && open(ov.places[0].path, undefined, false));
  }, [ov]); // eslint-disable-line react-hooks/exhaustive-deps
  // "show in file explorer": the file's folder, with the file selected (or the folder itself)
  useEffect(() => {
    if (!go) return;
    void fileApi.stat(go.path).then(
      (st) => (st.dir ? open(st.path) : open(dirName(st.path), st.name)),
      (e) => fail(e),
    );
  }, [go?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  const filterExts = useMemo(() => {
    const exts = (pick?.filters ?? []).flatMap((f) => f.extensions).map((x) => x.toLowerCase());
    return exts.length && !exts.includes("*") ? new Set(exts) : null;
  }, [pick]);
  const entries = useMemo(
    () => (listing?.entries ?? []).filter((e) => (mode === "folder" ? e.dir : e.dir || !filterExts || filterExts.has(e.ext))),
    [listing, mode, filterExts],
  );
  const selected = entries.filter((e) => sel.includes(e.path));
  const one = selected.length === 1 ? selected[0] : null;

  const activate = (e: Entry) => {
    if (e.dir) return void open(e.path);
    if (mode === "open") return answerPick([e.path]);
    if (mode === "save") return setSaveName(e.name);
    if (kindOf(e) === "xdc") return void openXdcInGames(e.path).then((r) => desk().say(r.added ? `${r.name} is in Games & Apps now.` : `Opened ${r.name}.`), fail);
    setSel([e.path]);
  };
  const click = (ev: React.MouseEvent, e: Entry) => {
    if ((ev.ctrlKey || ev.metaKey) && (mode === "browse" || pick?.multiple)) setSel((s) => (s.includes(e.path) ? s.filter((x) => x !== e.path) : [...s, e.path]));
    else setSel([e.path]);
    if (mode === "save" && !e.dir) setSaveName(e.name);
  };

  // names are edited in place (a browser prompt would pause the music and the animations); "" is a new folder
  const [editing, setEditing] = useState<{ path: string; value: string } | null>(null);
  const rename = (e: Entry) => setEditing({ path: e.path, value: e.name });
  const commitEdit = async (value: string) => {
    const ed = editing;
    setEditing(null);
    const name = value.trim();
    if (!ed || !name) return;
    try {
      if (!ed.path) {
        const r = await fileApi.mkdir(cwd, name);
        await open(cwd, baseName(r.path), false);
      } else if (name !== baseName(ed.path)) {
        const r = await fileApi.rename(ed.path, name);
        await open(cwd, baseName(r.path), false);
      }
    } catch (err) {
      fail(err);
    }
  };
  const nameBox = (value: string) => (
    <input
      className="input explorer-edit"
      defaultValue={value}
      aria-label="Name"
      ref={(el) => {
        if (!el || el.dataset.ready) return;
        el.dataset.ready = "1";
        el.focus();
        const dot = el.value.lastIndexOf(".");
        el.setSelectionRange(0, dot > 0 ? dot : el.value.length); // the name, ready to type over; the extension stays
      }}
      onKeyDown={(ev) => {
        ev.stopPropagation();
        if (ev.key === "Enter") void commitEdit(ev.currentTarget.value);
        if (ev.key === "Escape") setEditing(null);
      }}
      onBlur={(ev) => void commitEdit(ev.currentTarget.value)}
      onClick={(ev) => ev.stopPropagation()}
    />
  );
  const moveTo = async (list: Entry[]) => {
    const into = await pickFolderHere();
    if (!into) return;
    try {
      for (const e of list) await fileApi.moveInto(e.path, into);
      desk().say(`Moved ${list.length === 1 ? list[0].name : `${list.length} items`}.`);
      await refresh();
    } catch (err) {
      fail(err);
    }
  };
  const toTrash = async (list: Entry[]) => {
    try {
      for (const e of list) await fileApi.trash(e.path);
      desk().say(`${list.length === 1 ? list[0].name : `${list.length} items`} went to the trash (Trash, in the sidebar, puts things back).`);
      await refresh();
    } catch (err) {
      fail(err);
    }
  };
  const newFolder = () => setEditing({ path: "", value: "New folder" });
  const upload = async (files: File[]) => {
    if (!files.length || !cwd) return;
    try {
      let last = "";
      for (const f of files) last = await fileApi.upload(cwd, f);
      await open(cwd, baseName(last), false);
      desk().say(`${files.length === 1 ? files[0].name : `${files.length} files`} uploaded here.`);
    } catch (err) {
      fail(err);
    }
  };

  const menuFor = (e: Entry): MenuItem[] => {
    const list = selected.length > 1 && sel.includes(e.path) ? selected : [e];
    const many = list.length > 1;
    const k = kindOf(e);
    return [
      ...(!many ? [{ label: e.dir ? "Open" : k === "xdc" ? "Open in Games & Apps" : "Preview", run: () => (k === "xdc" || e.dir ? activate(e) : setSel([e.path])) }] : []),
      ...(!many && !e.dir ? [{ label: "Download to this device", icon: <Download size={14} />, run: () => downloadToDevice(e.path) }] : []),
      { sep: true },
      ...(!many
        ? [
            {
              label: "Show in device file explorer",
              icon: <Monitor size={14} />,
              disabled: !ov?.deviceExplorer,
              hint: ov?.deviceExplorer ? undefined : "on the computer only",
              run: () => void showOnDevice(e.path),
            },
            { label: "Copy path", icon: <Copy size={14} />, run: () => void navigator.clipboard?.writeText(e.path) },
          ]
        : []),
      ...(!many && e.dir && ov?.sharing.canChange
        ? [{ label: isShared(e.path) ? "Stop sharing on the network" : "Share on the network", icon: <Share2 size={14} />, hint: isShared(e.path) ? "shared" : "with your other devices", run: () => void fileApi.share(e.path, !isShared(e.path)).then((o) => (setOv(o), desk().say(isShared(e.path) ? `${e.name} isn't shared any more.` : `${e.name} is shared with your other devices on this network.`)), fail) }]
        : []),
      { sep: true },
      ...(!many ? [{ label: "Rename…", run: () => void rename(e) }] : []),
      { label: many ? `Move ${list.length} items to…` : "Move to…", run: () => void moveTo(list) },
      { label: many ? `Delete ${list.length} items` : "Delete", hint: "to the trash", danger: true, icon: <Trash2 size={14} />, run: () => void toTrash(list) },
    ];
  };
  const backgroundMenu = (): MenuItem[] => [
    { label: "New folder…", icon: <FolderPlus size={14} />, run: () => void newFolder() },
    { label: "Upload from this device…", icon: <Upload size={14} />, run: () => uploader.current?.click() },
    { sep: true },
    { label: "Show in device file explorer", icon: <Monitor size={14} />, disabled: !ov?.deviceExplorer, hint: ov?.deviceExplorer ? undefined : "on the computer only", run: () => void showOnDevice(cwd) },
    { label: "Copy path", icon: <Copy size={14} />, run: () => void navigator.clipboard?.writeText(cwd) },
  ];

  // a folder chosen from inside this browser (for "Move to…"): the picker over this window
  const pickFolderHere = async () => (await pickInExplorer({ mode: "folder", title: "Move to which folder?" }))?.[0] ?? null;

  const onKey = (ev: React.KeyboardEvent) => {
    if ((ev.target as HTMLElement).closest("input, textarea")) return;
    if (ev.key === "Backspace" && listing?.parent) (ev.preventDefault(), void open(listing.parent));
    else if (ev.key === "Enter" && one) activate(one);
    else if (ev.key === "Delete" && selected.length && !picking) void toTrash(selected);
    else if (ev.key === "F2" && one && !picking) void rename(one);
  };

  const crumbs = useMemo(() => {
    if (!cwd || !ov) return [];
    const place = [...ov.places, ...ov.wholePc.drives].filter((p) => cwd.toLowerCase().startsWith(p.path.toLowerCase())).sort((a, b) => b.path.length - a.path.length)[0];
    if (!place) return [{ name: cwd, path: cwd }];
    const rest = cwd.slice(place.path.length).split(/[\\/]/).filter(Boolean);
    const sep = cwd.includes("\\") ? "\\" : "/";
    const out = [{ name: place.name, path: place.path }];
    let acc = place.path.replace(/[\\/]$/, "");
    for (const r of rest) out.push({ name: r, path: (acc = `${acc}${sep}${r}`) });
    return out;
  }, [cwd, ov]);

  const places = ov ? [...ov.places, ...ov.wholePc.drives] : [];
  const shared = ov?.sharing.folders ?? [];
  const isShared = (p: string) => shared.some((s) => s.path.toLowerCase() === p.toLowerCase());
  const sidebar = (
    <nav className="side explorer-side">
      <div className="list">
        <div className="folder">Places</div>
        {places.map((p) => (
          <button key={p.id} className={`item${!trashView && cwd.toLowerCase().startsWith(p.path.toLowerCase()) ? " on" : ""}`} onClick={() => void open(p.path)} title={p.path}>
            {p.kind === "drive" ? <HardDrive size={15} /> : p.kind === "music" ? <Music2 size={15} /> : <Folder size={15} />} {p.name}
          </button>
        ))}
        {shared.length ? <div className="folder">Shared from this computer</div> : null}
        {shared.map((p) => (
          <button key={p.id} className={`item${!trashView && cwd.toLowerCase().startsWith(p.path.toLowerCase()) ? " on" : ""}`} onClick={() => void open(p.path)} title={p.path}>
            <Share2 size={15} /> {p.name}
          </button>
        ))}
        {!picking ? (
          <button className={`item${trashView ? " on" : ""}`} onClick={() => (setTrashView(true), setSel([]), void fileApi.trashList().then(setTrashed, fail))}>
            <Trash2 size={15} /> Trash
          </button>
        ) : null}
      </div>
      {ov?.wholePc.local && !picking ? (
        <label className="explorer-pc small">
          <input type="checkbox" checked={ov.wholePc.on} onChange={(e) => void fileApi.setWholePc(e.target.checked).then(setOv, fail)} />
          <span>
            The rest of this computer
            <span className="faint"> (only here, never from phones or the network)</span>
          </span>
        </label>
      ) : null}
      {ov?.sharing.canChange && !picking ? (
        <label className="explorer-pc small">
          <input type="checkbox" checked={ov.sharing.wholePc} onChange={(e) => void fileApi.shareWholePc(e.target.checked).then(setOv, fail)} />
          <span>
            Share the whole computer with your other devices
            <span className="faint"> (on this network they can open, add and change files; folders can be shared one at a time from their menu)</span>
          </span>
        </label>
      ) : null}
    </nav>
  );

  const preview = one && !picking ? <Preview e={one} deviceExplorer={Boolean(ov?.deviceExplorer)} onClose={() => setSel([])} /> : null;

  const body = trashView ? (
    <div className="explorer-list">
      {trashed.length ? null : <p className="muted" style={{ padding: 12 }}>The trash is empty.</p>}
      {trashed.map((t) => (
        <div key={t.id} className="explorer-row">
          <span className="explorer-name">
            <Trash2 size={15} /> {t.name}
          </span>
          <span className="faint small explorer-meta">{dirName(t.from)}</span>
          <span className="faint small explorer-meta">{when(t.at)}</span>
          <button className="btn small" onClick={() => void fileApi.restore(t.id).then((r) => (desk().say(`Put back: ${r.path}`), fileApi.trashList().then(setTrashed)), fail)}>
            <RotateCcw size={13} /> Put back
          </button>
        </div>
      ))}
    </div>
  ) : (
    <div
      className={`explorer-list${view === "grid" ? " grid" : ""}${dropping ? " dropping" : ""}`}
      onContextMenu={(ev) => !picking && (ev.target as HTMLElement).closest(".explorer-row, .explorer-tile") === null && openMenu(ev, backgroundMenu())}
      onDragOver={(ev) => [...ev.dataTransfer.types].includes("Files") && (ev.preventDefault(), setDropping(true))}
      onDragLeave={(ev) => ev.currentTarget === ev.target && setDropping(false)}
      onDrop={(ev) => {
        ev.preventDefault();
        setDropping(false);
        void upload([...ev.dataTransfer.files]);
      }}
    >
      {error ? <p className="danger-text" style={{ padding: 12 }}>{error}</p> : null}
      {!error && !entries.length ? <p className="muted" style={{ padding: 12 }}>Nothing here{filterExts ? " of the kinds asked for" : ""}. Drop files here to upload them.</p> : null}
      {editing && !editing.path ? (
        <div className={view === "grid" ? "explorer-tile on" : "explorer-row on"}>
          {view === "grid" ? <span className="explorer-tile-icon">{ICON.folder(34)}</span> : null}
          <span className="explorer-name">
            {view === "grid" ? null : ICON.folder(15)} {nameBox(editing.value)}
          </span>
        </div>
      ) : null}
      {entries.map((e) =>
        editing?.path === e.path ? (
          <div key={e.path} className={view === "grid" ? "explorer-tile on" : "explorer-row on"}>
            {view === "grid" ? <span className="explorer-tile-icon">{ICON[kindOf(e)](34)}</span> : null}
            <span className="explorer-name">
              {view === "grid" ? null : ICON[kindOf(e)](15)} {nameBox(editing.value)}
            </span>
          </div>
        ) : view === "grid" ? (
          <button
            key={e.path}
            className={`explorer-tile${sel.includes(e.path) ? " on" : ""}`}
            onClick={(ev) => click(ev, e)}
            onDoubleClick={() => activate(e)}
            onContextMenu={(ev) => !picking && (sel.includes(e.path) || setSel([e.path]), openMenu(ev, menuFor(e)))}
            title={e.name}
          >
            {kindOf(e) === "image" ? <img src={rawUrl(e.path)} alt="" loading="lazy" /> : <span className="explorer-tile-icon">{ICON[kindOf(e)](34)}</span>}
            <span className="explorer-tile-name">{e.name}</span>
          </button>
        ) : (
          <button
            key={e.path}
            className={`explorer-row${sel.includes(e.path) ? " on" : ""}`}
            onClick={(ev) => click(ev, e)}
            onDoubleClick={() => activate(e)}
            onContextMenu={(ev) => !picking && (sel.includes(e.path) || setSel([e.path]), openMenu(ev, menuFor(e)))}
          >
            <span className="explorer-name">
              {ICON[kindOf(e)](15)} {e.name}
            </span>
            {!narrow ? <span className="faint small explorer-meta">{e.dir ? "" : sizeOf(e.size)}</span> : null}
            {!narrow ? <span className="faint small explorer-meta">{when(e.mtime)}</span> : null}
          </button>
        ),
      )}
    </div>
  );

  // what the picker hands back
  const choose = () => {
    if (mode === "folder") return answerPick([one?.dir ? one.path : cwd]);
    if (mode === "save") {
      const name = saveName.trim();
      if (!name) return;
      const sep = cwd.includes("\\") ? "\\" : "/";
      return answerPick([`${cwd.replace(/[\\/]$/, "")}${sep}${name}`]);
    }
    const files = selected.filter((e) => !e.dir).map((e) => e.path);
    if (files.length) answerPick(pick?.multiple ? files : [files[0]]);
  };

  return (
    <div ref={ref} className={`explorer${narrow ? " narrow" : ""}${picking ? " picking" : ""}`} tabIndex={-1} onKeyDown={onKey}>
      <div className="explorer-bar">
        <button className="icon-btn" aria-label="Back" disabled={!history.current.length} onClick={() => void open(history.current.pop()!, undefined, false)}>
          <ArrowLeft size={15} />
        </button>
        <button className="icon-btn" aria-label="Up a folder" disabled={!listing?.parent || trashView} onClick={() => listing?.parent && void open(listing.parent)}>
          <FolderUp size={15} />
        </button>
        {narrow ? (
          <select className="select explorer-places" value="" onChange={(e) => e.target.value && void open(e.target.value)} aria-label="Places">
            <option value="">Places…</option>
            {places.map((p) => (
              <option key={p.id} value={p.path}>
                {p.name}
              </option>
            ))}
          </select>
        ) : null}
        <div className="explorer-crumbs">
          {trashView ? (
            <span>Trash</span>
          ) : (
            crumbs.map((c, i) => (
              <span key={c.path}>
                {i ? <span className="faint"> › </span> : null}
                <button className="link-btn" onClick={() => void open(c.path)}>
                  {c.name}
                </button>
              </span>
            ))
          )}
        </div>
        {!trashView ? (
          <>
            <button className="icon-btn" aria-label="New folder" data-tip="New folder" onClick={() => void newFolder()}>
              <FolderPlus size={15} />
            </button>
            <button className="icon-btn" aria-label="Upload from this device" data-tip="Upload from this device" onClick={() => uploader.current?.click()}>
              <Upload size={15} />
            </button>
            <button
              className="icon-btn"
              aria-label={view === "grid" ? "List view" : "Tile view"}
              onClick={() => {
                const v = view === "grid" ? "list" : "grid";
                setView(v);
                localStorage.setItem("pdd-explorer-view", v);
              }}
            >
              {view === "grid" ? <LayoutList size={15} /> : <LayoutGrid size={15} />}
            </button>
          </>
        ) : null}
      </div>
      <div className="explorer-body">
        {!narrow ? sidebar : null}
        {body}
        {preview}
      </div>
      {picking ? (
        <div className="explorer-pick">
          {mode === "save" ? <input className="input" value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="File name" aria-label="File name" autoFocus /> : null}
          <span className="faint small explorer-pick-note">
            {mode === "folder" ? (one?.dir ? `“${one.name}”` : `This folder`) : mode === "open" ? (selected.filter((e) => !e.dir).length ? `${selected.filter((e) => !e.dir).length} chosen` : "Choose a file, or upload one from this device") : ""}
          </span>
          <button className="btn" onClick={() => answerPick(null)}>
            Cancel
          </button>
          <button className="btn primary" onClick={choose} disabled={mode === "open" ? !selected.some((e) => !e.dir) : mode === "save" ? !saveName.trim() : !cwd}>
            {mode === "save" ? "Save here" : mode === "folder" ? "Choose this folder" : "Choose"}
          </button>
        </div>
      ) : null}
      <input
        ref={uploader}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const list = [...(e.target.files ?? [])];
          e.target.value = "";
          void upload(list);
        }}
      />
    </div>
  );
}

/** The selected file: shown in the window, with what can be done with it. */
function Preview({ e, deviceExplorer, onClose }: { e: Entry; deviceExplorer: boolean; onClose: () => void }) {
  const k = kindOf(e);
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    setText(null);
    if (k !== "text") return;
    const ctl = new AbortController();
    fetch(rawUrl(e.path), { signal: ctl.signal, headers: { Range: "bytes=0-399999" } })
      .then((r) => r.text())
      .then(setText, () => undefined);
    return () => ctl.abort();
  }, [e.path, k]);
  return (
    <aside className="explorer-preview">
      <div className="row" style={{ gap: 6, alignItems: "center" }}>
        <strong className="explorer-preview-name" title={e.name}>
          {e.name}
        </strong>
        <button className="icon-btn" aria-label="Close preview" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="explorer-preview-body">
        {k === "image" ? <img src={rawUrl(e.path)} alt={e.name} /> : null}
        {k === "audio" ? <audio src={rawUrl(e.path)} controls /> : null}
        {k === "video" ? <video src={rawUrl(e.path)} controls /> : null}
        {k === "pdf" ? <iframe src={rawUrl(e.path)} title={e.name} /> : null}
        {k === "text" ? (text === null ? <p className="faint">…</p> : e.ext === "md" || e.ext === "markdown" ? <Markdown text={text} /> : <pre className="small">{text}</pre>) : null}
        {k === "xdc" ? (
          <button className="btn primary" onClick={() => void openXdcInGames(e.path).then((r) => desk().say(r.added ? `${r.name} is in Games & Apps now.` : `Opened ${r.name}.`), fail)}>
            <Gamepad2 size={14} /> Open in Games & Apps
          </button>
        ) : null}
        {k === "file" || k === "folder" ? <p className="faint small">No preview for this kind of file.</p> : null}
      </div>
      <p className="faint small" style={{ margin: "6px 0" }}>
        {e.dir ? "Folder" : sizeOf(e.size)} · {when(e.mtime)}
        <br />
        <span style={{ wordBreak: "break-all" }}>{e.path}</span>
      </p>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {!e.dir ? (
          <button className="btn small" onClick={() => downloadToDevice(e.path)}>
            <Download size={13} /> Download to this device
          </button>
        ) : null}
        <button className="btn small" disabled={!deviceExplorer} title={deviceExplorer ? "" : "Only on the computer running the desktop"} onClick={() => void showOnDevice(e.path)}>
          <ExternalLink size={13} /> Show in device file explorer
        </button>
      </div>
    </aside>
  );
}
