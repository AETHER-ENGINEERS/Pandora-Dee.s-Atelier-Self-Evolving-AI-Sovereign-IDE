import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Code2,
  Download,
  FolderInput,
  Heart,
  LayoutGrid,
  List,
  Maximize,
  MessageCircle,
  Minimize,
  Play,
  RefreshCw,
  Rows3,
  Search,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { desk, useDesk, type AppPrefs, type LibSection, type LibSort, type LibView } from "../lib/store.ts";
import { gameScreen } from "../lib/bus.ts";
import { gameTurn } from "../lib/agent.ts";
import { appOrigin, bridge, groupApps, library, readScreen, type Pkg } from "../lib/xdc.ts";
import { slug } from "../lib/characters.ts";
import { CharAvatar, Confirm } from "../ui/common.tsx";
import { openMenu, type MenuItem } from "../ui/ContextMenu.tsx";

// ---------- catalog ----------

type CatalogGame = { slug: string; name: string; title: string; intent: string; versions?: { version: string; path: string; note?: string }[] };

type Version = { id: string; label: string; note?: string; size?: number; built?: number; pkg?: Pkg; path?: string };

/** One row in the library: a built-in game or a webxdc app with all its versions. */
type Item = {
  key: string;
  kind: "game" | "xdc";
  title: string;
  blurb: string;
  icon: string;
  versions: Version[];
  size: number;
  added: number;
  source?: string;
};

let catalogCache: CatalogGame[] | null = null;

function useCatalog() {
  const [games, setGames] = useState<CatalogGame[]>(catalogCache ?? []);
  useEffect(() => {
    if (catalogCache) return;
    fetch("/games/catalog.json")
      .then((r) => r.json())
      .then((d: { games: CatalogGame[] }) => {
        catalogCache = d.games;
        setGames(d.games);
      })
      .catch(() => setGames([]));
  }, []);
  return games;
}

export function useXdcLibrary() {
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "offline">("loading");
  const reload = useCallback(async () => {
    try {
      setPkgs(await library.list());
      setState("ready");
    } catch {
      setState("offline");
    }
  }, []);
  useEffect(() => {
    void reload();
    const on = () => void reload();
    window.addEventListener("pdd-xdc-changed", on);
    return () => window.removeEventListener("pdd-xdc-changed", on);
  }, [reload]);
  return { pkgs, state, reload };
}

export const libraryChanged = () => window.dispatchEvent(new Event("pdd-xdc-changed"));

function hue(text: string) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

function Tile({ item, size }: { item: Item; size: number }) {
  if (item.icon) return <img className="lib-icon" src={item.icon} alt="" style={{ width: size, height: size }} loading="lazy" />;
  const h = hue(item.title);
  return (
    <span className="lib-icon lib-letter" style={{ width: size, height: size, fontSize: size * 0.42, background: `linear-gradient(135deg, hsl(${h} 55% 38%), hsl(${(h + 50) % 360} 60% 22%))` }}>
      {item.title.replace(/[^A-Za-z0-9]/g, "").slice(0, 2) || "?"}
    </span>
  );
}

const fmtSize = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n > 1e3 ? `${Math.round(n / 1e3)} KB` : n ? `${n} B` : "");

export function chosenVersion(item: Item, prefs?: AppPrefs) {
  return item.versions.find((v) => v.id === prefs?.version) ?? item.versions[0];
}

// ---------- the app ----------

export function GamesApp() {
  const game = useDesk((s) => s.game);
  return game ? <Playing /> : <Library />;
}

function useItems() {
  const catalog = useCatalog();
  const { pkgs, state, reload } = useXdcLibrary();
  const items = useMemo<Item[]>(() => {
    const games: Item[] = catalog.map((g) => ({
      key: `game:${g.slug}`,
      kind: "game",
      title: g.title,
      blurb: g.intent,
      icon: "",
      versions: g.versions?.length ? g.versions.map((v) => ({ id: v.version, label: v.version, note: v.note, path: v.path })) : [{ id: "built-in", label: "Built in", path: `cleared/${g.slug}` }],
      size: 0,
      added: 0,
    }));
    const apps: Item[] = [...groupApps(pkgs).entries()].map(([key, list]) => {
      const top = list[0];
      return {
        key: `xdc:${key}`,
        kind: "xdc",
        title: top.name,
        blurb: top.description,
        icon: list.map((p) => library.iconUrl(p)).find(Boolean) ?? "",
        versions: list.map((p) => ({ id: p.id, label: p.version || new Date(p.built).toLocaleDateString(), note: p.notes || (p.parent ? "Your edit" : p.filename), size: p.size, built: p.built, pkg: p })),
        size: list.reduce((n, p) => n + p.size, 0),
        added: Math.max(...list.map((p) => p.added)),
        source: list.find((p) => p.source)?.source,
      };
    });
    return [...apps, ...games];
  }, [catalog, pkgs]);
  return { items, state, reload };
}

function Library() {
  const s = useDesk();
  const { items, state } = useItems();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const now = Date.now();
  const list = items
    .filter((it) => {
      const p = s.appPrefs[it.key];
      if (s.libSection === "games" && it.kind !== "game") return false;
      if (s.libSection === "xdc" && it.kind !== "xdc") return false;
      if (s.libSection === "favourites" && !p?.fav) return false;
      if (s.libSection === "recent" && !(p?.played && now - p.played < 30 * 86400_000)) return false;
      return `${it.title} ${it.blurb}`.toLowerCase().includes(q.toLowerCase());
    })
    .sort((a, b) => {
      const pa = s.appPrefs[a.key];
      const pb = s.appPrefs[b.key];
      if (s.libSort === "played") return (pb?.played ?? 0) - (pa?.played ?? 0) || a.title.localeCompare(b.title);
      if (s.libSort === "added") return b.added - a.added || a.title.localeCompare(b.title);
      if (s.libSort === "size") return b.size - a.size;
      return a.title.localeCompare(b.title);
    });
  const selected = items.find((it) => it.key === open);

  const doImport = async (files: FileList | File[]) => {
    const all = [...files].filter((f) => /\.(xdc|zip)$/i.test(f.name));
    if (!all.length) return desk().say("Pick .xdc files, or a .zip of them.");
    let added = 0;
    let dupes = 0;
    const errors: string[] = [];
    for (const [i, f] of all.entries()) {
      setBusy(`Importing ${i + 1} of ${all.length}: ${f.name}…`);
      try {
        const r = await library.import(f);
        added += r.added.length;
        dupes += r.duplicates;
        errors.push(...r.errors);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    setBusy("");
    libraryChanged();
    desk().set({ libSection: "xdc" });
    desk().say(
      `${added} new version${added === 1 ? "" : "s"} added.${dupes ? ` ${dupes} ${dupes === 1 ? "was" : "were"} already there (identical files are kept once).` : ""}${errors.length ? ` ${errors.length} couldn't be read: ${errors.slice(0, 2).join(" ")}` : ""}`,
    );
  };

  const play = (it: Item, v?: Version) => launch(it, v ?? chosenVersion(it, s.appPrefs[it.key]));

  return (
    <div
      className="lib"
      onDragOver={(e) => {
        if ([...e.dataTransfer.types].includes("Files")) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onDrop={(e) => {
        const files = [...e.dataTransfer.files];
        if (files.some((f) => /\.(xdc|zip)$/i.test(f.name))) {
          e.preventDefault();
          e.stopPropagation();
          void doImport(files);
        }
      }}
    >
      <nav className="lib-nav" aria-label="Sections">
        {(
          [
            ["all", "Everything"],
            ["games", "Games"],
            ["xdc", "Vector apps"],
            ["favourites", "Favourites"],
            ["recent", "Recently played"],
          ] as [LibSection, string][]
        ).map(([id, label]) => (
          <button key={id} className={`item${s.libSection === id ? " on" : ""}`} onClick={() => desk().set({ libSection: id })}>
            {label}
            <span className="faint small">
              {id === "all"
                ? items.length
                : id === "games"
                  ? items.filter((i) => i.kind === "game").length
                  : id === "xdc"
                    ? items.filter((i) => i.kind === "xdc").length
                    : id === "favourites"
                      ? items.filter((i) => s.appPrefs[i.key]?.fav).length
                      : ""}
            </span>
          </button>
        ))}
        <div className="divider" />
        <button className="btn small" onClick={() => fileRef.current?.click()}>
          <Upload size={14} /> Import .xdc or .zip
        </button>
        <button className="btn small" onClick={() => dirRef.current?.click()}>
          <FolderInput size={14} /> Import a folder
        </button>
        <button className="btn small" onClick={() => desk().openApp("studio")}>
          <Code2 size={14} /> XDC Studio
        </button>
        {state === "offline" ? <p className="small faint">The desktop server isn't running, so Vector apps can't load. Start the desktop with npm run dev.</p> : null}
      </nav>
      <section className="lib-main">
        <div className="toolbar">
          <Search size={15} className="faint" />
          <input className="input grow" style={{ maxWidth: 300 }} placeholder={`Search ${items.length}`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
          <select className="select" style={{ width: "auto" }} value={s.libSort} onChange={(e) => desk().set({ libSort: e.target.value as LibSort })} aria-label="Sort">
            <option value="name">A to Z</option>
            <option value="played">Recently played</option>
            <option value="added">Recently added</option>
            <option value="size">Largest</option>
          </select>
          <div className="seg" role="radiogroup" aria-label="View">
            {(
              [
                ["covers", <LayoutGrid size={14} key="c" />, "Big tiles"],
                ["grid", <Square size={14} key="g" />, "Cards"],
                ["list", <List size={14} key="l" />, "Details list"],
                ["compact", <Rows3 size={14} key="r" />, "Compact"],
              ] as [LibView, ReactNode, string][]
            ).map(([id, icon, label]) => (
              <button key={id} className={s.libView === id ? "on" : ""} onClick={() => desk().set({ libView: id })} aria-label={label} data-tip={label}>
                {icon}
              </button>
            ))}
          </div>
        </div>
        <Players />
        {busy ? <div className="note small" style={{ margin: 8 }}>{busy}</div> : null}
        <Grid list={list} view={s.libView} gridRef={gridRef} onOpen={setOpen} onPlay={play} />
      </section>
      {selected ? <Details item={selected} onClose={() => setOpen(null)} onPlay={play} /> : null}
      <input ref={fileRef} type="file" accept=".xdc,.zip" multiple hidden onChange={(e) => e.target.files && void doImport(e.target.files)} />
      <input
        ref={dirRef}
        type="file"
        hidden
        // @ts-expect-error: folder picking is supported by every desktop browser
        webkitdirectory=""
        onChange={(e) => e.target.files && void doImport(e.target.files)}
      />
    </div>
  );
}

function Grid({ list, view, gridRef, onOpen, onPlay }: { list: Item[]; view: LibView; gridRef: React.RefObject<HTMLDivElement | null>; onOpen: (key: string) => void; onPlay: (it: Item) => void }) {
  const prefs = useDesk((s) => s.appPrefs);
  const drag = useRef({ y: 0, top: 0, moved: false, down: false });
  const [dragging, setDragging] = useState(false);
  const size = view === "covers" ? 96 : view === "grid" ? 48 : view === "list" ? 32 : 22;
  return (
    <div
      ref={gridRef}
      className={`lib-grid view-${view}${dragging ? " dragging" : ""}`}
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.pointerType !== "mouse" || e.button !== 0) return;
        drag.current = { y: e.clientY, top: gridRef.current!.scrollTop, moved: false, down: true };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d.down) return;
        if (Math.abs(e.clientY - d.y) > 6) {
          d.moved = true;
          setDragging(true);
        }
        if (d.moved) gridRef.current!.scrollTop = d.top - (e.clientY - d.y);
      }}
      onPointerUp={() => {
        drag.current.down = false;
        setTimeout(() => setDragging(false), 0);
      }}
      onPointerLeave={() => {
        drag.current.down = false;
        setDragging(false);
      }}
      onClickCapture={(e) => {
        if (drag.current.moved) {
          e.stopPropagation();
          drag.current.moved = false;
        }
      }}
      onKeyDown={(e) => {
        const cards = [...(gridRef.current?.querySelectorAll<HTMLElement>(".lib-card") ?? [])];
        const i = cards.indexOf(document.activeElement as HTMLElement);
        const first = cards[0]?.getBoundingClientRect();
        const cols = first ? Math.max(1, Math.round(gridRef.current!.clientWidth / Math.max(1, first.width))) : 1;
        const go = (n: number) => {
          e.preventDefault();
          cards[Math.max(0, Math.min(cards.length - 1, n))]?.focus();
        };
        if (e.key === "ArrowRight") go(i + 1);
        else if (e.key === "ArrowLeft") go(i - 1);
        else if (e.key === "ArrowDown") go(i < 0 ? 0 : i + (view === "list" || view === "compact" ? 1 : cols));
        else if (e.key === "ArrowUp") go(i - (view === "list" || view === "compact" ? 1 : cols));
        else if (e.key === "Home") go(0);
        else if (e.key === "End") go(cards.length - 1);
        else if (e.key === "PageDown") gridRef.current!.scrollBy({ top: gridRef.current!.clientHeight * 0.9 });
        else if (e.key === "PageUp") gridRef.current!.scrollBy({ top: -gridRef.current!.clientHeight * 0.9 });
      }}
    >
      {view === "list" ? (
        <div className="lib-row lib-head small faint">
          <span />
          <span>Name</span>
          <span>Versions</span>
          <span>Kind</span>
          <span>Size</span>
          <span />
        </div>
      ) : null}
      {list.map((it) => {
        const p = prefs[it.key];
        const v = chosenVersion(it, p);
        return (
          <div
            key={it.key}
            className="lib-card"
            role="button"
            tabIndex={0}
            onClick={() => onOpen(it.key)}
            onContextMenu={(e) => openMenu(e, cardMenu(it, onOpen, onPlay))}
            onDoubleClick={() => onPlay(it)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onPlay(it);
              if (e.key === " ") (e.preventDefault(), onOpen(it.key));
              if (e.key.toLowerCase() === "f") desk().setAppPrefs(it.key, { fav: !p?.fav });
            }}
            title={`${it.title} · double-click or Enter to play, Space for details, F to favourite`}
          >
            <Tile item={it} size={size} />
            <span className="lib-title">
              <b>{it.title}</b>
              {view !== "compact" ? <span className="small muted lib-blurb">{it.blurb}</span> : null}
            </span>
            {view === "list" ? (
              <>
                <span className="small">{it.versions.length > 1 ? `${it.versions.length} · plays ${v.label}` : v.label}</span>
                <span className="small muted">{it.kind === "xdc" ? "Vector app" : "Game"}</span>
                <span className="small muted">{fmtSize(it.size)}</span>
              </>
            ) : (
              <span className="lib-badges">
                {it.kind === "xdc" ? <span className="pill">xdc</span> : null}
                {it.versions.length > 1 ? <span className="pill">{it.versions.length} versions</span> : null}
              </span>
            )}
            <span className="lib-actions">
              <button
                className={`icon-btn${p?.fav ? " on" : ""}`}
                aria-label={p?.fav ? "Remove from favourites" : "Add to favourites"}
                onClick={(e) => (e.stopPropagation(), desk().setAppPrefs(it.key, { fav: !p?.fav }))}
              >
                <Heart size={14} fill={p?.fav ? "currentColor" : "none"} />
              </button>
              <button className="icon-btn" aria-label={`Play ${it.title}`} onClick={(e) => (e.stopPropagation(), onPlay(it))}>
                <Play size={14} />
              </button>
            </span>
          </div>
        );
      })}
      {list.length === 0 ? <div className="empty">Nothing here yet.</div> : null}
    </div>
  );
}

/** Right-click on a game or app. */
function cardMenu(it: Item, onOpen: (key: string) => void, onPlay: (it: Item, v?: Version) => void): MenuItem[] {
  const s = desk();
  const p = s.appPrefs[it.key] ?? {};
  const chosen = chosenVersion(it, p);
  const pkg = chosen.pkg;
  return [
    { heading: it.title },
    { label: `Play${it.versions.length > 1 ? ` ${chosen.label}` : ""}`, run: () => onPlay(it) },
    ...(it.versions.length > 1
      ? [
          { sep: true } as MenuItem,
          { heading: "Play another version" } as MenuItem,
          ...it.versions.slice(0, 8).map((v) => ({ label: v.label, checked: v.id === chosen.id, run: () => onPlay(it, v) }) as MenuItem),
        ]
      : []),
    { sep: true },
    { label: "Details and versions", run: () => onOpen(it.key) },
    { label: p.fav ? "Remove from favourites" : "Add to favourites", checked: p.fav, run: () => s.setAppPrefs(it.key, { fav: !p.fav }) },
    ...(pkg
      ? ([
          { label: "Open in XDC Studio", run: () => (s.set({ studioPkg: pkg.id }), s.openApp("studio")) },
          {
            label: "Save as .xdc",
            run: () => {
              const a = document.createElement("a");
              a.href = library.exportUrl(pkg.id);
              a.download = "";
              a.click();
            },
          },
          ...(it.source ? [{ label: "Source code", run: () => window.open(it.source, "_blank", "noreferrer") } as MenuItem] : []),
        ] as MenuItem[])
      : []),
  ];
}

function Details({ item, onClose, onPlay }: { item: Item; onClose: () => void; onPlay: (it: Item, v?: Version) => void }) {
  const s = useDesk();
  const p = s.appPrefs[item.key] ?? {};
  const [ask, setAsk] = useState<Version | "data" | null>(null);
  const chosen = chosenVersion(item, p);
  const scope = (v: Version) => (item.kind === "xdc" && v.pkg ? (p.separate ? `${v.pkg.appKey}@${v.pkg.id}` : v.pkg.appKey) : "");
  return (
    <aside className="lib-details" aria-label={`${item.title} details`}>
      <div className="toolbar">
        <b className="grow">{item.title}</b>
        <button className="icon-btn" aria-label="Close details" onClick={onClose}>
          <X size={15} />
        </button>
      </div>
      <div className="scroll grow" style={{ padding: 12 }}>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <Tile item={item} size={72} />
          <div className="grow">
            <p className="small">{item.blurb || <span className="faint">No description.</span>}</p>
            {item.source ? (
              <a className="small" href={item.source} target="_blank" rel="noreferrer">
                Source code
              </a>
            ) : null}
          </div>
        </div>
        <button className="btn primary" style={{ width: "100%", margin: "10px 0" }} onClick={() => onPlay(item)}>
          <Play size={15} /> Play {item.versions.length > 1 ? chosen.label : ""}
        </button>
        <h4>Versions</h4>
        <p className="small faint">Pick the one Play opens. Every version stays installed, so you can go back any time.</p>
        <div className="versions">
          {item.versions.map((v) => (
            <div key={v.id} className={`version${v.id === chosen.id ? " on" : ""}`}>
              <label className="check" style={{ padding: 0, flex: 1, minWidth: 0 }}>
                <input type="radio" name={`ver-${item.key}`} checked={v.id === chosen.id} onChange={() => desk().setAppPrefs(item.key, { version: v.id })} />
                <span style={{ minWidth: 0 }}>
                  <b>{v.label}</b>
                  {v.pkg?.parent ? <span className="pill" style={{ marginLeft: 6 }}>edited</span> : null}
                  <br />
                  <span className="small faint">
                    {[v.note, v.built ? new Date(v.built).toLocaleDateString() : "", v.size ? fmtSize(v.size) : ""].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </label>
              <button className="icon-btn" aria-label={`Play ${v.label}`} data-tip="Play this version" onClick={() => onPlay(item, v)}>
                <Play size={13} />
              </button>
              {v.pkg ? (
                <>
                  <button
                    className="icon-btn"
                    aria-label="Open in XDC Studio"
                    data-tip="Open in XDC Studio"
                    onClick={() => {
                      desk().set({ studioPkg: v.pkg!.id });
                      desk().openApp("studio");
                    }}
                  >
                    <Code2 size={13} />
                  </button>
                  <a className="icon-btn" href={library.exportUrl(v.pkg.id)} aria-label="Save as .xdc" data-tip="Save as .xdc" download>
                    <Download size={13} />
                  </a>
                  <button className="icon-btn" aria-label="Remove this version" data-tip="Remove this version" onClick={() => setAsk(v)}>
                    <Trash2 size={13} />
                  </button>
                </>
              ) : null}
            </div>
          ))}
        </div>
        {item.kind === "xdc" ? (
          <>
            <h4 style={{ marginTop: 14 }}>Saved progress</h4>
            <label className="check">
              <input type="checkbox" checked={!p.separate} onChange={(e) => desk().setAppPrefs(item.key, { separate: !e.target.checked })} />
              <span>All versions share the same game state (turn off to give each version its own)</span>
            </label>
            <label className="check">
              <input type="checkbox" checked={p.wake ?? item.key === "xdc:jade-link"} onChange={(e) => desk().setAppPrefs(item.key, { wake: e.target.checked })} />
              <span>The characters playing answer when you make a move (like Jade does in Jade Link)</span>
            </label>
            <button className="btn small danger" onClick={() => setAsk("data")}>
              Clear the shared game state…
            </button>
          </>
        ) : null}
      </div>
      {ask === "data" ? (
        <Confirm
          title={`Clear ${item.title}'s game state?`}
          body={<p>Everyone's moves and shared progress for {p.separate ? "this version" : "all versions"} will be deleted. Things the app saved privately on this computer stay.</p>}
          yes="Clear"
          danger
          onYes={() => void library.clearUpdates(scope(chosen)).then(() => desk().say("Cleared."))}
          onClose={() => setAsk(null)}
        />
      ) : ask ? (
        <Confirm
          title={`Remove version ${ask.label}?`}
          body={<p>Its files are deleted from the library. Other versions stay.</p>}
          yes="Remove"
          danger
          onYes={() =>
            void library.remove(ask.pkg!.id).then(() => {
              libraryChanged();
              if (item.versions.length === 1) onClose();
            })
          }
          onClose={() => setAsk(null)}
        />
      ) : null}
    </aside>
  );
}

function Players() {
  const s = useDesk();
  const room = s.roomCharacters();
  const playing = s.game?.players ?? (JSON.parse(sessionStorage.getItem("pdd-players") ?? "null") as string[] | null) ?? room.map((c) => c.id);
  const [, force] = useState(0);
  const toggle = (id: string) => {
    const next = playing.includes(id) ? playing.filter((x) => x !== id) : [...playing, id];
    sessionStorage.setItem("pdd-players", JSON.stringify(next));
    if (s.game) desk().set({ game: { ...s.game, players: next } });
    force((n) => n + 1);
  };
  return (
    <div className="players">
      <span className="small muted">Playing with you:</span>
      {room.length === 0 ? <span className="small faint">nobody yet (invite someone from Characters)</span> : null}
      {room.map((c) => (
        <button
          key={c.id}
          className={`chip${playing.includes(c.id) ? " focus" : ""}`}
          style={{ ["--c" as string]: c.accent, cursor: "pointer" }}
          onClick={() => toggle(c.id)}
          aria-pressed={playing.includes(c.id)}
          data-tip={playing.includes(c.id) ? `${c.short} is playing: tap to sit out` : `Tap so ${c.short} plays too`}
        >
          <CharAvatar c={c} size={20} /> {c.short}
        </button>
      ))}
    </div>
  );
}

/** Open a game or app version in the Games window and tell the room who's playing. */
export function launch(it: Item, v: Version) {
  const s = desk();
  const room = s.roomCharacters().map((c) => c.id);
  const saved = JSON.parse(sessionStorage.getItem("pdd-players") ?? "null") as string[] | null;
  const players = (saved ?? room).filter((id) => room.includes(id));
  const prefs = s.appPrefs[it.key] ?? {};
  s.setAppPrefs(it.key, { played: Date.now(), plays: (prefs.plays ?? 0) + 1 });
  if (it.kind === "xdc" && v.pkg) {
    s.set({ game: { kind: "xdc", slug: v.pkg.appKey, title: it.title, players, pkgId: v.pkg.id, scope: prefs.separate ? `${v.pkg.appKey}@${v.pkg.id}` : v.pkg.appKey } });
  } else {
    s.set({ game: { kind: "game", slug: it.key.replace(/^game:/, ""), title: it.title, players, path: v.path } });
  }
  s.openApp("games");
  const names = players.map((id) => s.character(id)?.short).filter(Boolean);
  s.notice(names.length ? `${names.join(" and ")} sat down with you to play ${it.title}${it.versions.length > 1 ? ` (${v.label})` : ""}.` : `You opened ${it.title}.`);
}

// ---------- playing ----------

function backToList() {
  if (document.fullscreenElement) void document.exitFullscreen();
  desk().set({ game: null });
}

async function toggleFull() {
  if (document.fullscreenElement) return void document.exitFullscreen();
  try {
    await document.querySelector<HTMLDivElement>(".game-box")?.requestFullscreen();
  } catch {
    desk().toggleMax("games");
  }
}

export function GameBack() {
  return (
    <button className="btn small ghost" onClick={backToList} aria-label="Back to the library">
      <ArrowLeft size={15} /> Library
    </button>
  );
}

/** Controls that sit in the Games window's own title bar while something is open. */
export function GameBar() {
  const [full, setFull] = useState(false);
  useEffect(() => {
    const on = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  return (
    <>
      <span className="grow" />
      <button className="icon-btn" onClick={() => window.dispatchEvent(new Event("pdd-game-reload"))} data-tip="Reload" aria-label="Reload">
        <RefreshCw size={14} />
      </button>
      <button className="icon-btn" onClick={() => void gameTurn()} data-tip="Ask the players what they'd do" aria-label="Ask the players">
        <MessageCircle size={15} />
      </button>
      <button className="icon-btn" onClick={() => void toggleFull()} data-tip={full ? "Leave full screen" : "Full screen"} aria-label="Full screen">
        {full ? <Minimize size={15} /> : <Maximize size={15} />}
      </button>
    </>
  );
}

function Playing() {
  const g = useDesk((s) => s.game)!;
  const session = useDesk((s) => s.session);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [full, setFull] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [pkg, setPkg] = useState<Pkg | null>(null);
  const me = session ?? "You";
  const addr = `you:${slug(me) || "you"}`;

  useEffect(() => {
    if (g.kind !== "xdc" || !g.pkgId) return;
    library
      .list()
      .then((all) => setPkg(all.find((p) => p.id === g.pkgId) ?? null))
      .catch(() => setPkg(null));
  }, [g.kind, g.pkgId]);

  useEffect(() => {
    gameScreen.register(() => readScreen(frameRef.current?.contentWindow));
    const on = () => setFull(Boolean(document.fullscreenElement));
    const reload = () => setNonce((n) => n + 1);
    document.addEventListener("fullscreenchange", on);
    window.addEventListener("pdd-game-reload", reload);
    return () => {
      gameScreen.register(null);
      document.removeEventListener("fullscreenchange", on);
      window.removeEventListener("pdd-game-reload", reload);
    };
  }, []);

  useEffect(() => {
    bridge.onChat((from, app, content) => {
      const img = content.file?.dataUrl?.startsWith("data:image/") ? `\n\n![${content.file.name}](${content.file.dataUrl})` : content.file ? ` (sent a file: ${content.file.name})` : "";
      desk().post({ kind: "human", who: from, name: from, text: `${content.text ?? `Shared from ${app}`}${img}`, source: "desk" });
    });
  }, []);

  // Sound from the game follows the desktop's game & app volume.
  const appVolume = useDesk((s) => s.voice.appVolume);
  useEffect(() => {
    const send = () => frameRef.current?.contentWindow?.postMessage({ __pdd: "volume", volume: appVolume }, "*");
    send();
    const on = (e: MessageEvent) => {
      if (e.source === frameRef.current?.contentWindow && (e.data as { __pdd?: string })?.__pdd === "volume-ready") send();
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, [appVolume]);

  // Attach before the app's scripts run: they ask for their state immediately.
  useEffect(() => {
    const win = frameRef.current?.contentWindow;
    if (!win || g.kind !== "xdc" || !g.scope) return;
    return bridge.attach(win, g.scope, addr, me);
  });

  let src = "";
  if (g.kind === "xdc" && pkg && g.scope) src = library.runUrl(pkg, g.scope, addr, me);
  else if (g.kind === "game") src = `${appOrigin().origin}/games/${g.path ?? `cleared/${g.slug}`}/index.html`;

  return (
    <div className="game-box" style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--panel-solid)" }}>
      {full ? (
        <button className="btn small" style={{ position: "absolute", top: 10, right: 10, zIndex: 2, opacity: 0.6 }} onClick={() => void document.exitFullscreen()}>
          <X size={14} /> Leave full screen
        </button>
      ) : null}
      {src ? (
        <iframe
          ref={frameRef}
          key={`${src}#${nonce}`}
          className="game-frame"
          src={src}
          title={g.title}
          allow="fullscreen; autoplay; clipboard-write; gamepad"
        />
      ) : (
        <div className="empty">{g.kind === "xdc" ? "Opening…" : "This game couldn't be found."}</div>
      )}
    </div>
  );
}

