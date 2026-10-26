import { useEffect, useMemo, useState } from "react";
import { zipSync, strToU8 } from "fflate";
import { Copy, Download, FilePlus, GitBranch, Play, Save, Sparkles, Trash2 } from "lucide-react";
import { desk, useDesk } from "../lib/store.ts";
import { groupApps, library, type Pkg } from "../lib/xdc.ts";
import { Confirm } from "../ui/common.tsx";
import { useWidth } from "../ui/hooks.ts";
import { launch, libraryChanged, useXdcLibrary } from "./Games.tsx";

const TEXT = /\.(html?|js|mjs|cjs|ts|css|json|toml|md|txt|svg|xml|csv|glsl|frag|vert|wgsl)$/i;
const IMAGE = /\.(png|jpe?g|gif|webp|svg|ico)$/i;

const TEMPLATE: Record<string, string> = {
  "manifest.toml": 'name = "My App"\nversion = "0.1.0"\ndescription = "A webxdc app made in Pandora Dee Desktop"\n',
  "index.html": `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>My App</title>
  <script src="webxdc.js"></script>
  <style>
    body { font: 16px system-ui, sans-serif; margin: 0; padding: 16px; background: #14111d; color: #eee; }
    button { font: inherit; padding: 8px 14px; border-radius: 8px; border: 0; background: #b9a4ff; color: #000; }
    li { margin: 4px 0; }
  </style>
</head>
<body>
  <h1>Hello, <span id="me"></span></h1>
  <button id="wave">Wave</button>
  <ul id="log"></ul>
  <script src="app.js"></script>
</body>
</html>
`,
  "app.js": `// Every player (people and characters) sees the same list of updates, in the same order.
document.getElementById("me").textContent = window.webxdc.selfName;

document.getElementById("wave").onclick = () => {
  const name = window.webxdc.selfName;
  window.webxdc.sendUpdate({ payload: { wave: name }, info: name + " waved" }, "");
};

window.webxdc.setUpdateListener((update) => {
  const li = document.createElement("li");
  li.textContent = update.payload.wave + " waved 👋";
  document.getElementById("log").append(li);
});
`,
};

export function StudioApp() {
  const s = useDesk();
  const { pkgs, state, reload } = useXdcLibrary();
  const [ref, width] = useWidth<HTMLDivElement>();
  const pkg = pkgs.find((p) => p.id === s.studioPkg);
  const [files, setFiles] = useState<string[]>([]);
  const [path, setPath] = useState("");
  const [text, setText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [dir, setDir] = useState("");
  const [ask, setAsk] = useState<"delete" | null>(null);
  const editable = Boolean(pkg?.parent);
  const groups = useMemo(() => groupApps(pkgs), [pkgs]);

  useEffect(() => {
    void library.info().then((i) => setDir(i.xdcDir)).catch(() => setDir(""));
  }, []);

  useEffect(() => {
    if (!pkg) return setFiles([]);
    void library.files(pkg.id).then((list) => {
      setFiles(list);
      setPath((cur) => (list.includes(cur) ? cur : list.includes("index.html") ? "index.html" : list[0] ?? ""));
    });
  }, [pkg?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setDirty(false);
    if (!pkg || !path || !TEXT.test(path)) return setText("");
    void library.read(pkg.id, path).then(setText).catch(() => setText(""));
  }, [pkg?.id, path]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!pkg || !path || !editable) return;
    await library.write(pkg.id, path, text);
    setDirty(false);
    desk().say(`Saved ${path}. Press Run, or Reload in the game window, to see it.`);
  };

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && document.activeElement?.classList.contains("studio-editor")) {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });

  const fork = async () => {
    if (!pkg) return;
    const label = prompt("Name this new version", `${pkg.version || "0.0.0"}-mine`);
    if (label === null) return;
    const made = await library.fork(pkg.id, label.trim());
    libraryChanged();
    await reload();
    desk().set({ studioPkg: made.id });
    desk().say(`Made ${made.name} ${made.version}. Edit away; the original stays as it was.`);
  };

  const newApp = async () => {
    const name = prompt("What's your app called?", "My App");
    if (!name) return;
    const files: Record<string, Uint8Array> = {};
    for (const [k, v] of Object.entries(TEMPLATE)) files[k] = strToU8(k === "manifest.toml" ? v.replace("My App", name.replace(/"/g, "")) : k === "index.html" ? v.replace(/My App/g, name) : v);
    const bytes = zipSync(files);
    const r = await library.import(new File([bytes as Uint8Array<ArrayBuffer>], `${name}.xdc`));
    const base = r.added[0];
    if (!base) return;
    const editableCopy = await library.fork(base.id, "0.1.0-draft");
    libraryChanged();
    await reload();
    desk().set({ studioPkg: editableCopy.id });
  };

  const run = (p: Pkg) => {
    const list = groups.get(p.appKey) ?? [p];
    launch(
      {
        key: `xdc:${p.appKey}`,
        kind: "xdc",
        title: p.name,
        blurb: p.description,
        icon: "",
        size: 0,
        added: p.added,
        versions: list.map((x) => ({ id: x.id, label: x.version, pkg: x })),
      },
      { id: p.id, label: p.version, pkg: p },
    );
  };

  if (state === "offline") return <div className="empty">XDC Studio needs the desktop server. Start the desktop with npm run dev.</div>;

  return (
    <div ref={ref} className={`split${width < 620 ? " narrow" : ""}`}>
      <aside className="side">
        <div className="toolbar" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <select className="select" value={pkg?.id ?? ""} onChange={(e) => desk().set({ studioPkg: e.target.value })} aria-label="App version">
            <option value="">Choose an app version…</option>
            {[...groups.entries()]
              .sort((a, b) => a[1][0].name.localeCompare(b[1][0].name))
              .map(([key, list]) => (
                <optgroup key={key} label={list[0].name}>
                  {list.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.version || p.filename}
                      {p.parent ? " (yours)" : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
          </select>
          <button className="btn small" onClick={() => void newApp()}>
            <Sparkles size={14} /> New app from a template
          </button>
        </div>
        <div className="list">
          {files.map((f) => (
            <button key={f} className={`item${f === path ? " on" : ""}`} onClick={() => setPath(f)} title={f}>
              {f}
            </button>
          ))}
        </div>
      </aside>
      <section className="main">
        {!pkg ? (
          <div className="empty">
            <p>Open a version of any Vector app to look inside, or start a new one.</p>
            <p className="small faint">Imported versions stay exactly as they arrived. To change one, make a new version from it.</p>
          </div>
        ) : (
          <>
            <div className="toolbar">
              <b className="grow" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {pkg.name} <span className="muted">{pkg.version}</span>
              </b>
              <button className="btn small" onClick={() => run(pkg)}>
                <Play size={14} /> Run
              </button>
              {editable ? (
                <button className="btn small primary" disabled={!dirty} onClick={() => void save()} title="Ctrl+S">
                  <Save size={14} /> Save
                </button>
              ) : null}
              <button className="btn small" onClick={() => void fork()} title="Copy this version into a new one you can edit">
                <GitBranch size={14} /> New version
              </button>
              <a className="btn small" href={library.exportUrl(pkg.id)} download>
                <Download size={14} /> .xdc
              </a>
            </div>
            <div className="small muted" style={{ padding: "6px 12px", borderBottom: "1px solid var(--line)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {editable ? (
                <>
                  Your version{pkg.parent ? `, made from ${pkgs.find((p) => p.id === pkg.parent)?.version || "an earlier one"}` : ""}. Also on disk, for your own editor:
                  <code className="mono" style={{ userSelect: "all" }}>{dir ? `${dir}${dir.includes("\\") ? "\\" : "/"}${pkg.id}` : pkg.id}</code>
                  <button className="icon-btn" aria-label="Copy folder path" onClick={() => navigator.clipboard?.writeText(`${dir}${dir.includes("\\") ? "\\" : "/"}${pkg.id}`)}>
                    <Copy size={13} />
                  </button>
                </>
              ) : (
                <>Imported as {pkg.filename || "a file"}. Read-only: press New version to make a copy you can edit.</>
              )}
            </div>
            {editable ? (
              <div className="toolbar">
                <button
                  className="btn small ghost"
                  onClick={async () => {
                    const name = prompt("New file (folders with /)", "notes.md");
                    if (!name) return;
                    await library.write(pkg.id, name, "");
                    setFiles(await library.files(pkg.id));
                    setPath(name);
                  }}
                >
                  <FilePlus size={14} /> New file
                </button>
                <button className="btn small ghost" disabled={!path} onClick={() => setAsk("delete")}>
                  <Trash2 size={14} /> Delete file
                </button>
                <span className="grow" />
                <label className="small muted row" style={{ gap: 6 }}>
                  Version
                  <input
                    className="input"
                    style={{ width: 130, padding: "3px 8px" }}
                    defaultValue={pkg.version}
                    key={pkg.id}
                    onBlur={(e) => void library.update(pkg.id, { version: e.target.value }).then(() => libraryChanged())}
                  />
                </label>
              </div>
            ) : null}
            {!path ? (
              <div className="empty">No files.</div>
            ) : TEXT.test(path) ? (
              <textarea
                className="editor studio-editor"
                value={text}
                readOnly={!editable}
                spellCheck={false}
                onChange={(e) => {
                  setText(e.target.value);
                  setDirty(true);
                }}
                aria-label={path}
              />
            ) : IMAGE.test(path) ? (
              <div className="preview" style={{ display: "grid", placeItems: "center" }}>
                <img src={`/api/xdc/${pkg.id}/file?path=${encodeURIComponent(path)}`} alt={path} style={{ maxWidth: "100%", maxHeight: "100%", imageRendering: "pixelated" }} />
              </div>
            ) : (
              <div className="empty">{path} is a binary file. Edit it with another program in the folder above.</div>
            )}
          </>
        )}
      </section>
      {ask && pkg ? (
        <Confirm
          title={`Delete ${path}?`}
          body={<p>It's removed from this version only.</p>}
          yes="Delete"
          danger
          onYes={() =>
            void library.removeFile(pkg.id, path).then(async () => {
              const list = await library.files(pkg.id);
              setFiles(list);
              setPath(list[0] ?? "");
            })
          }
          onClose={() => setAsk(null)}
        />
      ) : null}
    </div>
  );
}
