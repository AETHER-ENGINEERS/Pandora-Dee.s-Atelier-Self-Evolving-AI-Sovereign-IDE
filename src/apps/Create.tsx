import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, ExternalLink, FilePlus2, FileText, Images, Palette, RefreshCw, Save, Settings2, Sparkles, Square, Trash2, Wrench } from "lucide-react";
import { desk, useDesk } from "../lib/store.ts";
import { makePictures, savePictures } from "../lib/media.ts";
import { EnginesDialog } from "./Engines.tsx";
import { Confirm } from "../ui/common.tsx";
import { openMenu, type MenuItem } from "../ui/ContextMenu.tsx";

/**
 * Create: the vault's pictures and PDFs (Gallery), a painter that runs right here (miniPaint, kept offline),
 * and outside apps to install and open them in (GIMP, Krita, Inkscape, Storytold's Craft apps).
 */

type Kind = "image" | "svg" | "pdf" | "raw";
type AppInfo = {
  id: string; name: string; what: string; license: string; home: string; opens: Kind[]; recommended: boolean;
  installed: boolean; version: string; how: string; where: string; source: string;
  job: { state: string; done: number; total: number; error: string } | null;
};
type Pic = { path: string; size: number; mtime: number; kind: Kind };

const KIND: [RegExp, Kind][] = [
  [/\.(png|jpe?g|gif|webp|avif|bmp|tiff?|apng|ico)$/i, "image"],
  [/\.svg$/i, "svg"],
  [/\.pdf$/i, "pdf"],
  [/\.(cr2|cr3|nef|arw|dng|raf|orf|rw2)$/i, "raw"],
];
const kindOf = (p: string): Kind | null => KIND.find(([re]) => re.test(p))?.[1] ?? null;
const raw = (p: string) => `/api/vault/raw/${p.split("/").map(encodeURIComponent).join("/")}`;
const PAINTABLE = /\.(png|jpe?g|gif|webp|avif|bmp|apng|ico|svg)$/i;

async function api<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `The desktop answered ${r.status}.`);
  return j as T;
}

let appsCache: AppInfo[] = [];
export async function creativeApps(): Promise<AppInfo[]> {
  appsCache = await api<AppInfo[]>("/api/create/apps");
  return appsCache;
}
export async function openIn(id: string, path?: string) {
  try {
    await api("/api/create/open", { id, path });
  } catch (e) {
    desk().say(e instanceof Error ? e.message : String(e));
  }
}

type Tab = "gallery" | "imagine" | "paint" | "apps";

export function CreateApp() {
  const [tab, setTab] = useState<Tab>(() => (sessionStorage.getItem("pdd-create-tab") as Tab) || "gallery");
  const [apps, setApps] = useState<AppInfo[]>(appsCache);
  const [doc, setDoc] = useState<{ path: string | null; n: number }>({ path: null, n: 0 });
  const go = (t: Tab) => (setTab(t), sessionStorage.setItem("pdd-create-tab", t));
  const refresh = useCallback(() => void creativeApps().then(setApps, (e) => desk().say(String(e?.message || e))), []);
  useEffect(refresh, [refresh]);
  const paint = (path: string | null) => (setDoc((d) => ({ path, n: d.n + 1 })), go("paint"));

  // other apps ask Create to open something: window.dispatchEvent(new CustomEvent("pdd-create", { detail: { paint: "pictures/x.png" } }))
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ paint?: string; tab?: Tab }>).detail;
      if (d?.paint !== undefined) paint(d.paint || null);
      else if (d?.tab) go(d.tab);
    };
    window.addEventListener("pdd-create", on);
    return () => window.removeEventListener("pdd-create", on);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="create">
      <nav className="create-tabs" role="tablist">
        {([["gallery", <Images size={15} key="g" />, "Gallery"], ["imagine", <Sparkles size={15} key="i" />, "Imagine"], ["paint", <Palette size={15} key="p" />, "Paint"], ["apps", <Wrench size={15} key="a" />, "Apps"]] as const).map(([id, icon, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`tab${tab === id ? " on" : ""}`} onClick={() => go(id)}>
            {icon} {label}
          </button>
        ))}
      </nav>
      <div className="create-body">
        {tab === "gallery" ? <Gallery apps={apps} onPaint={paint} /> : null}
        {tab === "imagine" ? <Imagine apps={apps} onPaint={paint} /> : null}
        {/* the painter stays loaded while you look elsewhere, so nothing is lost switching tabs */}
        <div style={{ display: tab === "paint" ? "contents" : "none" }}>
          <Paint key={doc.n} path={doc.path} apps={apps} onSaved={(p) => setDoc((d) => ({ ...d, path: p }))} onNew={() => paint(null)} />
        </div>
        {tab === "apps" ? <Apps apps={apps} refresh={refresh} /> : null}
      </div>
    </div>
  );
}

/** Items for "Open with": the painter here, then each installed app that edits this kind of file. */
function openWith(p: string, apps: AppInfo[], onPaint: (p: string) => void): MenuItem[] {
  const k = kindOf(p);
  const items: MenuItem[] = [];
  if (PAINTABLE.test(p)) items.push({ label: "Edit in Paint", run: () => onPaint(p) });
  for (const a of apps) if (a.installed && k && a.opens.includes(k)) items.push({ label: `Open in ${a.name}`, run: () => void openIn(a.id, p) });
  items.push({ label: "Open in a browser tab", run: () => void window.open(raw(p), "_blank", "noopener") });
  return items;
}

function Gallery({ apps, onPaint }: { apps: AppInfo[]; onPaint: (p: string) => void }) {
  const [pics, setPics] = useState<Pic[] | null>(null);
  const [filter, setFilter] = useState<"all" | Kind>("all");
  const [q, setQ] = useState("");
  const load = useCallback(() => {
    fetch("/api/vault/tree")
      .then((r) => r.json())
      .then((tree: { path: string; dir: boolean; size: number; mtime: number }[]) =>
        setPics(tree.flatMap((f) => (f.dir ? [] : kindOf(f.path) ? [{ path: f.path, size: f.size, mtime: f.mtime, kind: kindOf(f.path)! }] : [])).sort((a, b) => b.mtime - a.mtime)),
      )
      .catch(() => setPics([]));
  }, []);
  useEffect(load, [load]);
  const shown = useMemo(() => (pics ?? []).filter((p) => (filter === "all" || p.kind === filter) && (!q || p.path.toLowerCase().includes(q.toLowerCase()))), [pics, filter, q]);
  const dflt = (p: Pic) => {
    if (PAINTABLE.test(p.path) && p.kind !== "svg") return onPaint(p.path);
    const app = apps.find((a) => a.installed && a.opens.includes(p.kind));
    if (app) return void openIn(app.id, p.path);
    window.open(raw(p.path), "_blank", "noopener");
  };
  return (
    <div className="gallery">
      <div className="toolbar">
        <select className="select" style={{ width: "auto" }} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Show">
          <option value="all">Everything</option>
          <option value="image">Pictures</option>
          <option value="svg">Drawings (SVG)</option>
          <option value="pdf">PDFs</option>
          <option value="raw">Camera RAW</option>
        </select>
        <input className="input grow" placeholder="Find by name or folder" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find" />
        <button className="icon-btn" data-tip="Look again" aria-label="Refresh" onClick={load}>
          <RefreshCw size={15} />
        </button>
        <button className="btn small" onClick={() => onPaint("")}>
          <FilePlus2 size={14} /> New picture
        </button>
      </div>
      {!pics ? <div className="empty small faint">Looking through the vault…</div> : null}
      {pics && !shown.length ? (
        <div className="empty">
          {pics.length ? "Nothing matches." : "No pictures or PDFs in the vault yet. Paste or drop some into a note, save one from Paint, or put them in the vault folder."}
        </div>
      ) : null}
      <div className="gallery-grid">
        {shown.map((p) => (
          <button
            key={p.path}
            className="gallery-item"
            title={p.path}
            onDoubleClick={() => dflt(p)}
            onKeyDown={(e) => e.key === "Enter" && dflt(p)}
            onContextMenu={(e) => openMenu(e, [{ heading: p.path }, ...openWith(p.path, apps, onPaint), { sep: true }, { label: "Copy its path", run: () => void navigator.clipboard?.writeText(p.path) }])}
          >
            {p.kind === "image" || p.kind === "svg" ? <img src={raw(p.path)} alt="" loading="lazy" decoding="async" /> : <div className="gallery-doc"><FileText size={34} /><span className="small">{p.kind.toUpperCase()}</span></div>}
            <span className="gallery-name small">{p.path.split("/").pop()}</span>
          </button>
        ))}
      </div>
      {pics?.length ? <div className="small faint" style={{ padding: "4px 10px" }}>Double-click to open; right-click to choose where.</div> : null}
    </div>
  );
}

type MiniPaint = Window & {
  Layers?: { get_dimensions: () => { width: number; height: number }; convert_layers_to_canvas: (ctx: CanvasRenderingContext2D) => void };
};

function Paint({ path, apps, onSaved, onNew }: { path: string | null; apps: AppInfo[]; onSaved: (p: string) => void; onNew: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [busy, setBusy] = useState(false);
  // miniPaint reads ?image= without decoding it, so it gets the path as-is (each segment already encoded)
  const src = `/vendor/minipaint/index.html${path ? `?image=${raw(path)}` : ""}`;

  const save = async (as?: boolean) => {
    const w = frame.current?.contentWindow as MiniPaint | null;
    if (!w?.Layers) return desk().say("Paint is still starting.");
    let target = path && !as && /\.(png|jpe?g|webp)$/i.test(path) ? path : "";
    if (!target) {
      const base = path ? path.replace(/\.[^./]+$/, "") : `pictures/picture ${new Date().toISOString().slice(0, 10)}`;
      const name = prompt("Save in the vault as (.png, .jpg or .webp)", `${base}.png`);
      if (!name) return;
      target = /\.(png|jpe?g|webp)$/i.test(name) ? name.replace(/^\/+/, "") : `${name.replace(/^\/+/, "")}.png`;
    }
    setBusy(true);
    try {
      const { width, height } = w.Layers.get_dimensions();
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      const ctx = c.getContext("2d")!;
      const type = /\.jpe?g$/i.test(target) ? "image/jpeg" : /\.webp$/i.test(target) ? "image/webp" : "image/png";
      if (type === "image/jpeg") (ctx.fillStyle = "#fff"), ctx.fillRect(0, 0, width, height);
      w.Layers.convert_layers_to_canvas(ctx);
      const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, type, 0.92));
      if (!blob) throw new Error("Couldn't make the picture.");
      const r = await fetch(`/api/vault/file?path=${encodeURIComponent(target)}`, { method: "PUT", body: blob });
      if (!r.ok) throw new Error(`Saving answered ${r.status}.`);
      onSaved(target);
      desk().say(`Saved ${target}.`);
    } catch (e) {
      desk().say(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const outside = path ? apps.filter((a) => a.installed && a.opens.includes(kindOf(path) ?? "image")) : [];
  return (
    <div className="paint">
      <div className="toolbar">
        <b className="grow mono small" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{path || "New picture"}</b>
        <button className="btn small" onClick={onNew}>
          <FilePlus2 size={14} /> New
        </button>
        <button className="btn small primary" disabled={busy} onClick={() => void save()}>
          <Save size={14} /> Save
        </button>
        <button className="btn small" disabled={busy} onClick={() => void save(true)}>
          Save as…
        </button>
        {outside.length ? (
          <button className="btn small" onClick={(e) => openMenu(e, [{ heading: "Save first, then open the saved file in" }, ...outside.map((a) => ({ label: a.name, run: () => void openIn(a.id, path!) }))])}>
            <ExternalLink size={14} /> Open in…
          </button>
        ) : null}
      </div>
      <iframe ref={frame} className="paint-frame" src={src} title="Paint (miniPaint)" />
    </div>
  );
}

function Apps({ apps, refresh }: { apps: AppInfo[]; refresh: () => void }) {
  const [ask, setAsk] = useState<AppInfo | null>(null);
  const [gone, setGone] = useState<AppInfo | null>(null);
  const busy = apps.some((a) => a.job && !["done", "error", "installer"].includes(a.job.state));
  // while something downloads, or an installer is open, look again every couple of seconds
  const waiting = busy || apps.some((a) => a.job?.state === "installer" && !a.installed);
  useEffect(() => {
    if (!waiting) return;
    const t = window.setInterval(refresh, busy ? 1000 : 4000);
    return () => window.clearInterval(t);
  }, [waiting, busy, refresh]);

  const install = async (a: AppInfo) => {
    try {
      await api("/api/create/install", { id: a.id });
      refresh();
    } catch (e) {
      desk().say(e instanceof Error ? e.message : String(e));
    }
  };
  const status = (a: AppInfo) => {
    const j = a.job;
    if (j?.state === "error") return <span className="small danger-text">{j.error}</span>;
    if (j?.state === "downloading") return <span className="small">Downloading {Math.round(j.done / 1048576)} of {Math.round(j.total / 1048576)} MB…</span>;
    if (j?.state === "checking") return <span className="small">Checking it against the release's SHA-256…</span>;
    if (j?.state === "unpacking") return <span className="small">Unpacking…</span>;
    if (j?.state === "starting") return <span className="small">Starting…</span>;
    if (j?.state === "installer" && !a.installed) return <span className="small">The installer is open in its own window. Finish it there; this updates when it's done.</span>;
    if (a.installed) return <span className="small faint">Installed{a.version ? ` · ${a.version}` : ""}{a.how === "desktop" ? " · by the desktop" : " · on this computer"}</span>;
    return <span className="small faint">{a.source}</span>;
  };
  return (
    <div className="create-apps">
      <div className="note small">
        Pictures and PDFs from the Gallery open in these. GIMP is the one to start with; for PDFs, PdfCraft, Okular,
        LibreOffice, Xournal++ or SumatraPDF. Craft apps by Storytold come from their GitHub releases and are checked
        against the release's SHA-256 before anything runs; they're new and change quickly. The others install through
        your system's package manager, in a window where you answer its questions. (If winget says it “failed when
        opening source(s)”, run <code>winget source reset --force</code> in an administrator terminal.)
        <button className="icon-btn" style={{ float: "right" }} data-tip="Look again" aria-label="Refresh" onClick={refresh}>
          <RefreshCw size={14} />
        </button>
      </div>
      {apps.map((a) => (
        <div key={a.id} className="create-app">
          <div className="grow">
            <div>
              <b>{a.name}</b> <span className="small faint">{a.license}</span>
              {a.recommended && !a.installed ? <span className="pill small">recommended</span> : null}
            </div>
            <div className="small">{a.what}</div>
            {status(a)}
            {a.id === "gimp" && a.installed && /^2\./.test(a.version) ? <div className="small faint">GIMP 3 is out; installing it keeps GIMP 2 until you remove it.</div> : null}
          </div>
          <div className="create-app-actions">
            {a.installed ? (
              <button className="btn small" onClick={() => void openIn(a.id)}>
                Open
              </button>
            ) : null}
            {!a.installed || (a.id === "gimp" && /^2\./.test(a.version)) ? (
              <button className="btn small primary" disabled={Boolean(a.job && !["done", "error", "installer"].includes(a.job.state))} onClick={() => setAsk(a)}>
                <Download size={14} /> {a.installed ? "Install GIMP 3" : "Install"}
              </button>
            ) : null}
            {a.installed && a.how === "desktop" ? (
              <button className="icon-btn" data-tip="Remove" aria-label={`Remove ${a.name}`} onClick={() => setGone(a)}>
                <Trash2 size={14} />
              </button>
            ) : null}
            <a className="icon-btn" href={a.home} target="_blank" rel="noopener noreferrer" data-tip="Its website" aria-label={`${a.name}'s website`}>
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
      ))}
      {ask ? (
        <Confirm
          title={`Install ${ask.name}?`}
          body={
            <>
              <p>From <b>{ask.source}</b> ({ask.license}).</p>
              <p>
                {ask.source.startsWith("github")
                  ? ask.id === "artcraft"
                    ? "Its installer is downloaded, checked against the release's SHA-256, and opened for you to go through."
                    : "The portable build for this computer is downloaded (about 70–130 MB), checked against the release's SHA-256, and kept in the desktop's data folder. Nothing else on the computer changes."
                  : "Your package manager opens in its own window; it shows the app's licence and asks before installing."}
              </p>
            </>
          }
          yes="Install"
          onYes={() => void install(ask)}
          onClose={() => setAsk(null)}
        />
      ) : null}
      {gone ? (
        <Confirm
          title={`Remove ${gone.name}?`}
          body={<p>Removes the copy the desktop installed. Your pictures stay where they are.</p>}
          yes="Remove"
          danger
          onYes={() => void api("/api/create/remove", { id: gone.id }).then(refresh, (e) => desk().say(String(e?.message || e)))}
          onClose={() => setGone(null)}
        />
      ) : null}
    </div>
  );
}

// ---------- Imagine: pictures from a picture engine ----------

const SIZES: [string, number, number][] = [
  ["Square", 1024, 1024],
  ["Portrait", 832, 1216],
  ["Landscape", 1216, 832],
  ["Wide", 1344, 768],
  ["Small square", 512, 512],
];
type Made = { path: string; prompt: string };
// what was made this session stays while you switch tabs
let session: Made[] = [];

function Imagine({ apps, onPaint }: { apps: AppInfo[]; onPaint: (p: string) => void }) {
  const all = useDesk((s) => s.media.images);
  const engines = useMemo(() => all.filter((e) => e.enabled), [all]);
  const [engineId, setEngineId] = useState(() => sessionStorage.getItem("pdd-imagine-engine") || "");
  const engine = engines.find((e) => e.id === engineId) ?? engines[0];
  const [prompt, setPrompt] = useState(() => sessionStorage.getItem("pdd-imagine-prompt") || "");
  const [negative, setNegative] = useState("");
  const [size, setSize] = useState(0);
  const [count, setCount] = useState(1);
  const [seed, setSeed] = useState("");
  const [made, setMade] = useState<Made[]>(session);
  const [status, setStatus] = useState("");
  const [setup, setSetup] = useState(false);
  const stop = useRef<AbortController | null>(null);
  const [running, setRunning] = useState(false);

  const go = async () => {
    if (!engine || !prompt.trim()) return;
    sessionStorage.setItem("pdd-imagine-prompt", prompt);
    const ctl = new AbortController();
    stop.current = ctl;
    setRunning(true);
    setStatus("Starting…");
    try {
      const [, w, h] = SIZES[size];
      const pics = await makePictures(engine, { prompt: prompt.trim(), negative: negative.trim(), width: w, height: h, count, seed: seed.trim() ? Number(seed) : undefined }, setStatus, ctl.signal);
      setStatus("Saving…");
      const paths = await savePictures(pics, prompt);
      session = [...paths.map((p) => ({ path: p, prompt })), ...session].slice(0, 60);
      setMade(session);
      setStatus("");
    } catch (e) {
      setStatus(ctl.signal.aborted ? "Stopped. (The engine may finish the job anyway.)" : e instanceof Error ? e.message : String(e));
    } finally {
      stop.current = null;
      setRunning(false);
    }
  };

  return (
    <div className="imagine">
      <div className="imagine-form">
        <div className="row">
          <select className="select grow" value={engine?.id ?? ""} onChange={(e) => (setEngineId(e.target.value), sessionStorage.setItem("pdd-imagine-engine", e.target.value))} aria-label="Engine">
            {engines.length ? engines.map((e) => <option key={e.id} value={e.id}>{e.name}</option>) : <option value="">No picture engine yet</option>}
          </select>
          <button className="icon-btn" data-tip="Picture engines" aria-label="Picture engines" onClick={() => setSetup(true)}>
            <Settings2 size={15} />
          </button>
        </div>
        {!engines.length ? (
          <div className="note small">
            Add the server that makes the pictures: ComfyUI, Draw Things (on a Mac), Automatic1111/Forge, or an OpenAI-style image
            service. <button className="btn small" onClick={() => setSetup(true)}>Add one</button>
          </div>
        ) : null}
        <textarea className="input" rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the picture: who or what, where, the light, the style…" aria-label="Prompt" onKeyDown={(e) => e.key === "Enter" && (e.ctrlKey || e.metaKey) && void go()} />
        <details>
          <summary className="small">Leave out, seed</summary>
          <textarea className="input small" rows={2} value={negative} onChange={(e) => setNegative(e.target.value)} placeholder="What to leave out (not used by OpenAI-style services)" aria-label="Leave out" />
          <input className="input small" value={seed} onChange={(e) => setSeed(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Seed (blank: a new one each time)" aria-label="Seed" />
        </details>
        <div className="row">
          <select className="select grow" value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="Size">
            {SIZES.map(([n, w, h], i) => <option key={n} value={i}>{n} · {w}×{h}</option>)}
          </select>
          <select className="select" style={{ width: "auto" }} value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="How many">
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} picture{n > 1 ? "s" : ""}</option>)}
          </select>
        </div>
        <div className="row">
          {running ? (
            <button className="btn" onClick={() => stop.current?.abort()}>
              <Square size={14} /> Stop
            </button>
          ) : (
            <button className="btn primary grow" disabled={!engine || !prompt.trim()} onClick={() => void go()}>
              <Sparkles size={14} /> Make it
            </button>
          )}
        </div>
        {status ? <div className="small muted">{status}</div> : null}
        <div className="small faint">Saved in the vault under {desk().media.pictureFolder}/. Ctrl+Enter makes it.</div>
      </div>
      <div className="imagine-results">
        {!made.length ? <div className="empty small faint">What you make shows here.</div> : null}
        {made.map((m) => (
          <figure key={m.path} className="imagine-pic" onContextMenu={(e) => openMenu(e, [{ heading: m.path }, ...openWith(m.path, apps, onPaint), { sep: true }, { label: "Use this prompt again", run: () => setPrompt(m.prompt) }])}>
            <img src={raw(m.path)} alt={m.prompt} onDoubleClick={() => onPaint(m.path)} />
            <figcaption className="small">
              <span className="grow faint" title={m.prompt}>{m.prompt}</span>
              <button className="btn small" onClick={() => onPaint(m.path)}>Edit</button>
              <button className="btn small" onClick={() => setPrompt(m.prompt)}>Again</button>
            </figcaption>
          </figure>
        ))}
      </div>
      {setup ? <EnginesDialog type="images" onClose={() => setSetup(false)} /> : null}
    </div>
  );
}
