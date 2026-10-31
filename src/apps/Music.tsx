import { useEffect, useMemo, useRef, useState } from "react";
import { AudioWaveform, ChevronUp, Disc3, Folder, FolderOpen, FolderPlus, Globe2, ListMusic, Maximize2, Mic2, Pause, Play, Radio, Repeat, Repeat1, Search, Shuffle, SkipBack, Sparkles, SkipForward, Star, Trash2, Upload, Users, Volume2 } from "lucide-react";
import { desk, useDesk } from "../lib/store.ts";
import {
  addFiles,
  coverOf,
  current,
  enqueue,
  findStations,
  forgetStation,
  loadLibrary,
  next,
  playList,
  previous,
  saveStation,
  scan,
  searchLibrary,
  seek,
  toggle,
  useMusic,
  type Item,
  type Station,
  type Track,
  shuffled,
  albumOrder,
} from "../lib/music.ts";
import { Num } from "../ui/Num.tsx";
import { openMenu, type MenuItem } from "../ui/ContextMenu.tsx";
import { useWidth } from "../ui/hooks.ts";
import { Visualizer, importPresets, milkdropPresets } from "./Visualizer.tsx";
import { WorldRadio } from "./WorldRadio.tsx";
import { SongMaker } from "./SongMaker.tsx";
import { openSongInfo, SongInfoHost } from "../ui/SongInfo.tsx";
import { copyText } from "../lib/clipboard.ts";
import { askText } from "../ui/Ask.tsx";

const PAGE = 400;

type View = "songs" | "make" | "albums" | "artists" | "world" | "radio" | "find" | "folders";
const time = (s: number) => (Number.isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "–:––");
const setPrefs = (p: Partial<ReturnType<typeof desk>["music"]>) => desk().set({ music: { ...desk().music, ...p } });
const asItems = (ts: Track[]): Item[] => ts.map((t) => ({ kind: "track", ...t }));

export function MusicApp() {
  const m = useMusic();
  const prefs = useDesk((s) => s.music);
  const [view, setView] = useState<View>("songs");
  const [q, setQ] = useState("");
  const [album, setAlbum] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const [ref, width] = useWidth<HTMLDivElement>();
  const files = useRef<HTMLInputElement>(null);
  const presetFiles = useRef<HTMLInputElement>(null);
  const vizBox = useRef<HTMLDivElement>(null);
  const narrow = width < 700;

  useEffect(() => {
    if (!m.loaded) void loadLibrary();
  }, [m.loaded]);

  const songs = useMemo(() => searchLibrary(q, Infinity), [q, m.tracks]); // eslint-disable-line react-hooks/exhaustive-deps
  // the songs list draws a few hundred at a time and adds more as you scroll near the end
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [q]);
  const more = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    const el = more.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setShown((n) => n + PAGE), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [shown, songs, view]);
  const albums = useMemo(() => {
    const map = new Map<string, Track[]>();
    for (const t of songs) {
      const k = `${t.album || "Singles"}\u0000${t.album ? t.artist : ""}`;
      map.set(k, [...(map.get(k) ?? []), t]);
    }
    return [...map.entries()].map(([k, ts]) => ({ key: k, name: k.split("\u0000")[0], artist: k.split("\u0000")[1] || ts[0]?.artist || "", tracks: ts.sort((a, b) => a.track - b.track), cover: ts.find((t) => t.cover) }));
  }, [songs]);
  const artists = useMemo(() => {
    const map = new Map<string, Track[]>();
    for (const t of songs) map.set(t.artist || "Unknown artist", [...(map.get(t.artist || "Unknown artist") ?? []), t]);
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [songs]);

  const cur = current();
  const trackMenu = (list: Track[], i: number): MenuItem[] => [
    { label: "Play", run: () => playList(asItems(list), i) },
    { label: "Play next", run: () => useMusic.setState((s) => ({ queue: [...s.queue.slice(0, s.index + 1), { kind: "track", ...list[i] }, ...s.queue.slice(s.index + 1)] })) },
    { label: "Add to the queue", run: () => enqueue(asItems([list[i]])) },
    { sep: true },
    { label: "Copy title and artist", run: () => void copyText(`${list[i].title}${list[i].artist ? ` · ${list[i].artist}` : ""}`) },
    { sep: true },
    { label: "Properties…", run: () => openSongInfo({ track: list[i], made: desk().media.made.find((s) => s.file.replace(/\.[^.]+$/, "") === list[i].title || s.title === list[i].title) }) },
  ];

  // the visualizer's choices: from the player's footer, and from the sidebar (where phones can reach them)
  const vizMenu = (e: React.MouseEvent): void =>
    openMenu(e, [
      { heading: "Visualizer" },
      ...(["bars", "scope", "milkdrop", "off"] as const).map((v) => ({
        label: { bars: "Bars", scope: "Scope", milkdrop: "Milkdrop", off: "No visualizer" }[v],
        checked: prefs.viz === v,
        run: () => setPrefs({ viz: v }),
      })),
      { sep: true },
      { label: "Open in its own window", run: () => desk().openApp("visualizer") },
      { label: "Full screen", run: () => void vizBox.current?.requestFullscreen?.() },
      { label: "As the desktop background", checked: prefs.vizBackground, run: () => setPrefs({ vizBackground: !prefs.vizBackground }) },
      { label: "Milkdrop: a new preset every 25 seconds", checked: prefs.cycle, run: () => setPrefs({ cycle: !prefs.cycle }) },
      { label: "Milkdrop: choose a preset…", run: () => void choosePreset() },
      { label: "Import Milkdrop presets (.json)…", run: () => presetFiles.current?.click() },
      { sep: true },
      { heading: "While characters talk" },
      { label: "Lower the music while one speaks", checked: prefs.duck, run: () => setPrefs({ duck: !prefs.duck }) },
      { label: "Let the one in focus comment on new songs (uses the AI)", checked: prefs.comment, run: () => setPrefs({ comment: !prefs.comment }) },
    ]);

  const side = (
    <nav className="side music-side">
      {(
        [
          ["songs", <ListMusic size={15} key="s" />, `Songs (${m.tracks.length})`],
          ["make", <Sparkles size={15} key="m" />, "Make a song"],
          ["albums", <Disc3 size={15} key="a" />, "Albums"],
          ["artists", <Users size={15} key="r" />, "Artists"],
          ["world", <Globe2 size={15} key="w" />, "Worldband"],
          ["radio", <Radio size={15} key="ra" />, `Radio (${prefs.stations.length})`],
          ["find", <Search size={15} key="f" />, "Find stations"],
          ["folders", <FolderPlus size={15} key="fo" />, "Folders"],
        ] as [View, React.ReactNode, string][]
      ).map(([id, icon, text]) => (
        <button key={id} className={`item${view === id ? " on" : ""}`} onClick={() => (setView(id), setAlbum(null))}>
          {icon} {text}
        </button>
      ))}
      <button className="item" onClick={vizMenu} aria-haspopup="menu">
        <AudioWaveform size={15} /> Visualizer
      </button>
    </nav>
  );

  return (
    <div
      ref={ref}
      className={`music${dropping ? " dropping" : ""}${narrow ? " narrow" : ""}`}
      onDragOver={(e) => [...e.dataTransfer.types].includes("Files") && (e.preventDefault(), setDropping(true))}
      onDragLeave={(e) => e.currentTarget === e.target && setDropping(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropping(false);
        if (e.dataTransfer.files.length) void addFiles([...e.dataTransfer.files]).then((r) => desk().say(`${r.tracks} songs in your library.`));
      }}
    >
      <div className="music-body">
        {side}
        <section className="music-main">
          {prefs.viz !== "off" && view !== "make" ? (
            <>
              <div className="music-viz" ref={vizBox} style={{ height: prefs.vizHeight }} onDoubleClick={() => void vizBox.current?.requestFullscreen?.()}>
                <Visualizer big />
              </div>
              <div
                className="music-split"
                role="separator"
                aria-orientation="horizontal"
                aria-label="Visualizer height: drag, or use the arrow keys"
                aria-valuenow={prefs.vizHeight}
                tabIndex={0}
                data-tip="Drag to resize · double-click to fold away or back"
                onPointerDown={(e) => {
                  const start = e.clientY;
                  const from = prefs.vizHeight;
                  const box = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const move = (ev: PointerEvent) => setPrefs({ vizHeight: Math.round(Math.max(40, Math.min(box.height - 90, from + ev.clientY - start))) });
                  const up = () => (window.removeEventListener("pointermove", move), window.removeEventListener("pointerup", up));
                  window.addEventListener("pointermove", move);
                  window.addEventListener("pointerup", up);
                }}
                onDoubleClick={() => setPrefs({ vizHeight: prefs.vizHeight > 60 ? 40 : 180 })}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                    e.preventDefault();
                    setPrefs({ vizHeight: Math.max(40, prefs.vizHeight + (e.key === "ArrowDown" ? 20 : -20)) });
                  }
                }}
              />
            </>
          ) : null}
          {m.scanning ? <div className="note small" style={{ margin: 8 }}>{m.scanning}</div> : null}
          {m.error ? <div className="note small bad" style={{ margin: 8 }}>{m.error}</div> : null}

          {view === "songs" || view === "albums" || view === "artists" ? (
            <div className="toolbar">
              <Search size={15} className="faint" />
              <input className="input grow" style={{ maxWidth: 320 }} value={q} placeholder="Title, artist, album, genre, year" onChange={(e) => setQ(e.target.value)} aria-label="Search your music" />
              {album ? (
                <button className="btn small" onClick={() => setAlbum(null)}>
                  All albums
                </button>
              ) : null}
              <span className="grow" />
              <button
                className="btn small"
                disabled={!songs.length}
                data-tip={view === "albums" && !album ? "Albums in a random order, each played through" : view === "artists" ? "Artists in a random order, each one's albums in order" : "Every song, in a random order"}
                onClick={() => {
                  if (view === "albums" && !album) playList(asItems(shuffled(albums).flatMap((a) => a.tracks)), 0, true);
                  else if (view === "artists") playList(asItems(shuffled(artists).flatMap(([, ts]) => albumOrder(ts))), 0, true);
                  else playList(asItems(shuffled(album ? albums.find((x) => x.key === album)?.tracks ?? [] : songs)), 0, true);
                }}
              >
                <Shuffle size={13} /> {view === "albums" && !album ? "Shuffle albums" : view === "artists" ? "Shuffle artists" : "Shuffle all"}
              </button>
            </div>
          ) : null}

          <div className="music-list">
            {view === "songs" ? (
              songs.length ? (
                <table className="songs">
                  <tbody>
                    {songs.slice(0, shown).map((t, i) => (
                      <tr
                        key={t.id}
                        className={cur?.kind === "track" && cur.id === t.id ? "on" : ""}
                        onDoubleClick={() => playList(asItems(songs), i)}
                        onContextMenu={(e) => openMenu(e, trackMenu(songs, i))}
                      >
                        <td className="play-cell">
                          <button className="icon-btn" aria-label={`Play ${t.title}`} onClick={() => playList(asItems(songs), i)}>
                            {cur?.kind === "track" && cur.id === t.id && m.playing ? <Volume2 size={13} /> : <Play size={13} />}
                          </button>
                        </td>
                        <td className="t-title">{t.title}</td>
                        <td className="muted">{t.artist}</td>
                        {!narrow ? <td className="faint">{t.album}</td> : null}
                        <td className="faint num-cell">{time(t.duration)}</td>
                      </tr>
                    ))}
                    {shown < songs.length ? (
                      <tr ref={more}>
                        <td colSpan={5} className="faint small">
                          Loading more… ({shown} of {songs.length})
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              ) : (
                <Empty onFolders={() => setView("folders")} onFiles={() => files.current?.click()} loaded={m.loaded} searching={Boolean(q)} />
              )
            ) : null}

            {view === "albums" ? (
              album ? (
                (() => {
                  const a = albums.find((x) => x.key === album);
                  if (!a) return null;
                  return (
                    <div className="album-view">
                      <div className="album-head">
                        {a.cover ? <img src={`/api/music/cover?id=${a.cover.id}`} alt="" /> : <div className="no-cover"><Disc3 size={40} /></div>}
                        <div>
                          <h3 style={{ margin: 0 }}>{a.name}</h3>
                          <div className="muted">{a.artist}</div>
                          <button className="btn primary small" style={{ marginTop: 8 }} onClick={() => playList(asItems(a.tracks))}>
                            <Play size={13} /> Play
                          </button>
                        </div>
                      </div>
                      {a.tracks.map((t, i) => (
                        <div key={t.id} className={`album-track${cur?.kind === "track" && cur.id === t.id ? " on" : ""}`} onDoubleClick={() => playList(asItems(a.tracks), i)} onContextMenu={(e) => openMenu(e, trackMenu(a.tracks, i))}>
                          <span className="faint">{t.track || i + 1}</span> {t.title} <span className="grow" /> <span className="faint">{time(t.duration)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()
              ) : (
                <div className="albums">
                  {albums.map((a) => (
                    <button key={a.key} className="album" onClick={() => setAlbum(a.key)} onDoubleClick={() => playList(asItems(a.tracks))}>
                      {a.cover ? <img src={`/api/music/cover?id=${a.cover.id}`} alt="" loading="lazy" /> : <div className="no-cover"><Disc3 size={34} /></div>}
                      <b>{a.name}</b>
                      <span className="faint small">{a.artist}</span>
                    </button>
                  ))}
                </div>
              )
            ) : null}

            {view === "artists"
              ? artists.map(([name, ts]) => (
                  <div key={name} className="artist-row" onDoubleClick={() => playList(asItems(albumOrder(ts)), 0, true)}>
                    <Mic2 size={14} className="faint" /> <b>{name}</b> <span className="faint small">{ts.length} songs</span>
                    <span className="grow" />
                    <button className="btn small" onClick={() => playList(asItems(albumOrder(ts)), 0, true)}>
                      <Play size={12} /> Play
                    </button>
                  </div>
                ))
              : null}

            {view === "world" ? <WorldRadio /> : null}
            {view === "make" ? <SongMaker /> : null}
            {view === "radio" ? <Stations list={prefs.stations} saved /> : null}
            {view === "find" ? <FindStations /> : null}
            {view === "folders" ? <Folders onFiles={() => files.current?.click()} /> : null}
          </div>
        </section>
      </div>

      <SongInfoHost />
      <footer className="now-playing">
        <div className="np-art">{cur && coverOf(cur) ? <img src={coverOf(cur)} alt="" /> : <Disc3 size={28} className="faint" />}</div>
        <div className="np-meta">
          <b>{cur ? (cur.kind === "track" ? cur.title : cur.name) : "Nothing playing"}</b>
          <span className="muted small">{cur ? (cur.kind === "track" ? [cur.artist, cur.album].filter(Boolean).join(" · ") : `Radio${cur.country ? ` · ${cur.country}` : ""}`) : "Pick a song, an album or a station"}</span>
        </div>
        <div className="np-controls">
          <button className={`icon-btn${prefs.shuffle ? " on" : ""}`} aria-pressed={prefs.shuffle} aria-label="Shuffle" data-tip-up="" data-tip="Shuffle" onClick={() => setPrefs({ shuffle: !prefs.shuffle })}>
            <Shuffle size={15} />
          </button>
          <button className="icon-btn" aria-label="Previous" onClick={previous}>
            <SkipBack size={16} />
          </button>
          <button className="icon-btn np-play" aria-label={m.playing ? "Pause" : "Play"} onClick={toggle}>
            {m.playing ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button className="icon-btn" aria-label="Next" onClick={() => void next()}>
            <SkipForward size={16} />
          </button>
          <button
            className={`icon-btn${prefs.repeat !== "off" ? " on" : ""}`}
            aria-label={`Repeat: ${prefs.repeat}`}
            data-tip-up=""
            data-tip={prefs.repeat === "one" ? "Repeat this song" : prefs.repeat === "all" ? "Repeat the list" : "No repeat"}
            onClick={() => setPrefs({ repeat: prefs.repeat === "off" ? "all" : prefs.repeat === "all" ? "one" : "off" })}
          >
            {prefs.repeat === "one" ? <Repeat1 size={15} /> : <Repeat size={15} />}
          </button>
        </div>
        <div className="np-seek">
          <span className="faint small">{time(m.position)}</span>
          <input type="range" min={0} max={m.duration || 0} step={1} value={Math.min(m.position, m.duration || 0)} disabled={!m.duration} onChange={(e) => seek(Number(e.target.value))} aria-label="Position" />
          <span className="faint small">{cur?.kind === "radio" ? "live" : time(m.duration)}</span>
        </div>
        <div className="np-side">
          <Num min={0} max={1} step={0.05} value={prefs.volume} onChange={(volume) => setPrefs({ volume })} aria-label="Music volume" percent />
          <select className="select" value={prefs.viz} onChange={(e) => setPrefs({ viz: e.target.value as typeof prefs.viz })} aria-label="Visualizer">
            <option value="bars">Bars</option>
            <option value="scope">Scope</option>
            <option value="milkdrop">Milkdrop</option>
            <option value="off">No visualizer</option>
          </select>
          <button
            className="icon-btn"
            aria-label="Visualizer options"
            onClick={vizMenu}
          >
            <Maximize2 size={15} />
          </button>
        </div>
      </footer>
      <input
        ref={files}
        type="file"
        multiple
        hidden
        accept="audio/*,.flac,.opus,.m4a"
        onChange={(e) => {
          const list = [...(e.target.files ?? [])];
          e.target.value = "";
          if (list.length) void addFiles(list).then((r) => desk().say(`${r.tracks} songs in your library.`));
        }}
      />
      <input
        ref={presetFiles}
        type="file"
        multiple
        hidden
        accept=".json"
        onChange={(e) => {
          const list = [...(e.target.files ?? [])];
          e.target.value = "";
          void importPresets(list).then((n) => desk().say(n ? `Imported ${n} preset${n === 1 ? "" : "s"}; they're marked ★.` : "No Butterchurn (.json) presets in those files. Classic .milk files need converting first."));
        }}
      />
    </div>
  );
}

async function choosePreset() {
  const all = Object.keys(await milkdropPresets()).sort((a, b) => Number(!a.startsWith("★")) - Number(!b.startsWith("★")) || a.localeCompare(b));
  const name = await askText("Choose a preset", "", { body: `Type part of a preset's name (${all.length} presets).` });
  if (!name) return;
  const hit = all.find((x) => x.toLowerCase().includes(name.toLowerCase()));
  if (!hit) return desk().say("No preset has that in its name.");
  desk().set({ music: { ...desk().music, preset: hit, viz: "milkdrop", cycle: false } });
}

function Empty({ onFolders, onFiles, loaded, searching }: { onFolders: () => void; onFiles: () => void; loaded: boolean; searching: boolean }) {
  if (!loaded) return <div className="empty">Reading your music…</div>;
  if (searching) return <div className="empty">Nothing matches.</div>;
  return (
    <div className="empty">
      <p>No music yet.</p>
      <div className="row" style={{ justifyContent: "center", gap: 8 }}>
        <button className="btn primary" onClick={onFolders}>
          <FolderPlus size={14} /> Add a music folder
        </button>
        <button className="btn" onClick={onFiles}>
          <Upload size={14} /> Add files
        </button>
      </div>
      <p className="small faint">Or drop audio files here. Internet radio is under Find stations.</p>
    </div>
  );
}

function Stations({ list, saved }: { list: Station[]; saved?: boolean }) {
  const cur = current();
  if (!list.length) return <div className="empty">{saved ? "No saved stations yet: find some under Find stations." : "No stations found."}</div>;
  const items: Item[] = list.map((s) => ({ kind: "radio", ...s }));
  return (
    <div className="stations">
      {list.map((st, i) => (
        <div
          key={st.url}
          className={`station${cur?.kind === "radio" && cur.url === st.url ? " on" : ""}`}
          onDoubleClick={() => playList(items, i)}
          onContextMenu={(e) =>
            openMenu(e, [
              { label: "Play", run: () => playList(items, i) },
              saved ? { label: "Forget this station", danger: true, run: () => forgetStation(st.url) } : { label: "Save", run: () => saveStation(st) },
              ...(st.homepage ? [{ label: "Open its website", run: () => window.open(st.homepage, "_blank", "noopener") }] : []),
            ])
          }
        >
          {st.favicon ? <img src={st.favicon} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.visibility = "hidden")} /> : <Radio size={18} className="faint" />}
          <div className="st-meta">
            <b>{st.name}</b>
            <span className="faint small">{[st.country, st.tags?.split(",").slice(0, 4).join(", "), st.codec && `${st.codec}${st.bitrate ? ` ${st.bitrate}k` : ""}`].filter(Boolean).join(" · ")}</span>
          </div>
          <button className="btn small" onClick={() => playList(items, i)}>
            <Play size={12} /> Play
          </button>
          {saved ? (
            <button className="icon-btn" aria-label={`Forget ${st.name}`} onClick={() => forgetStation(st.url)}>
              <Trash2 size={13} />
            </button>
          ) : (
            <button className="icon-btn" aria-label={`Save ${st.name}`} data-tip="Save" onClick={() => (saveStation(st), desk().say(`Saved ${st.name}.`))}>
              <Star size={13} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function FindStations() {
  const [q, setQ] = useState("");
  const [by, setBy] = useState<"name" | "tag" | "country">("tag");
  const [found, setFound] = useState<Station[] | null>(null);
  const [note, setNote] = useState("");
  const go = async () => {
    if (!q.trim()) return;
    setNote("Looking…");
    try {
      setFound(await findStations(q.trim(), by));
      setNote("");
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <>
      <form className="toolbar" onSubmit={(e) => (e.preventDefault(), void go())}>
        <select className="select" style={{ width: "auto" }} value={by} onChange={(e) => setBy(e.target.value as typeof by)} aria-label="Search by">
          <option value="tag">Style (jazz, lofi, ambient…)</option>
          <option value="name">Station name</option>
          <option value="country">Country</option>
        </select>
        <input className="input grow" value={q} placeholder={by === "tag" ? "lofi" : by === "country" ? "Japan" : "BBC Radio 6"} onChange={(e) => setQ(e.target.value)} aria-label="Find stations" />
        <button className="btn" type="submit">
          Search
        </button>
      </form>
      <p className="small faint" style={{ margin: "0 10px 6px" }}>
        From radio-browser.info, a free, open directory. Stations play through the desktop, so the visualizer works with them.
      </p>
      {note ? <div className="note small" style={{ margin: 8 }}>{note}</div> : null}
      {found ? <Stations list={found} /> : null}
    </>
  );
}

function Folders({ onFiles }: { onFiles: () => void }) {
  const prefs = useDesk((s) => s.music);
  const own = useMusic((s) => s.own);
  const scanning = useMusic((s) => s.scanning);
  const [path, setPath] = useState("");
  const [browse, setBrowse] = useState(false);
  const addFolder = (f: string) => {
    const folders = [...new Set([...prefs.folders, f])];
    desk().set({ music: { ...desk().music, folders } });
    void rescan(folders);
  };
  const rescan = async (folders: string[]) => {
    const r = await scan(folders);
    desk().say(
      `${r.tracks} songs in your library, from ${r.walked ?? "?"} folders${r.failed ? ` (${r.failed} files couldn't be read)` : ""}.${r.unreadable?.length ? ` Couldn't open: ${r.unreadable.join(", ")}` : ""}`,
    );
  };
  return (
    <div style={{ padding: 10 }}>
      <h3 style={{ marginTop: 0 }}>Where your music is</h3>
      <p className="small muted">Folders on the computer running the desktop. They're read where they are (nothing is copied), including folders inside them.</p>
      {[own, ...prefs.folders].filter(Boolean).map((f) => (
        <div key={f} className="kv" style={{ gridTemplateColumns: "1fr auto" }}>
          <span className="mono small">
            {f}
            {f === own ? <span className="faint"> (files you add here)</span> : null}
          </span>
          {f !== own ? (
            <button
              className="icon-btn"
              aria-label={`Remove ${f}`}
              onClick={() => {
                const folders = prefs.folders.filter((x) => x !== f);
                desk().set({ music: { ...desk().music, folders } });
                void rescan(folders);
              }}
            >
              <Trash2 size={13} />
            </button>
          ) : (
            <span />
          )}
        </div>
      ))}
      <form
        className="row"
        style={{ marginTop: 10, gap: 6 }}
        onSubmit={(e) => {
          e.preventDefault();
          const f = path.trim().replace(/^"|"$/g, "");
          if (!f) return;
          const folders = [...new Set([...prefs.folders, f])];
          desk().set({ music: { ...desk().music, folders } });
          setPath("");
          void rescan(folders);
        }}
      >
        <input className="input mono grow" value={path} placeholder="D:\Music  or  /home/you/Music" onChange={(e) => setPath(e.target.value)} aria-label="Folder to add" />
        <button className="btn" type="button" onClick={() => setBrowse(true)}>
          <FolderOpen size={14} /> Browse…
        </button>
        <button className="btn primary" type="submit" disabled={Boolean(scanning)}>
          <FolderPlus size={14} /> Add folder
        </button>
      </form>
      {browse ? <FolderPicker onPick={(f) => (setBrowse(false), addFolder(f))} onClose={() => setBrowse(false)} /> : null}
      <div className="row" style={{ marginTop: 8, gap: 6 }}>
        <button className="btn" onClick={onFiles}>
          <Upload size={14} /> Add files…
        </button>
        <button className="btn" disabled={Boolean(scanning)} onClick={() => void rescan(prefs.folders)}>
          Read the folders again
        </button>
      </div>
    </div>
  );
}

type Place = { path: string; name: string };

/** Picking a folder on the computer running the desktop (a page can't see real folder paths on its own). */
function FolderPicker({ onPick, onClose }: { onPick: (path: string) => void; onClose: () => void }) {
  const [at, setAt] = useState<{ path: string; parent: string | null; folders: Place[]; audio: number } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const go = (p: string) => {
    setError("");
    setBusy(true);
    fetch(`/api/folders?path=${encodeURIComponent(p)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `Couldn't open ${p}.`);
        setAt(j);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };
  useEffect(() => go(""), []);
  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog folder-picker" role="dialog" aria-modal="true" aria-label="Choose a music folder">
        <h2>Choose a music folder</h2>
        <div className="row" style={{ gap: 6 }}>
          <button className="icon-btn" disabled={at?.parent == null} onClick={() => at?.parent != null && go(at.parent)} aria-label="Up one folder" data-tip="Up one folder">
            <ChevronUp size={15} />
          </button>
          <span className="mono small grow ellipsis" title={at?.path}>{at?.path || "This computer"}</span>
        </div>
        {error ? <div className="small danger-text">{error}</div> : null}
        <div className="folder-list">
          {at?.folders.map((f) => (
            <button key={f.path} className="item" onClick={() => go(f.path)} onDoubleClick={() => onPick(f.path)} title={f.path}>
              <Folder size={14} className="faint" /> {f.name}
            </button>
          ))}
          {busy ? <div className="empty small faint">Looking…</div> : at && !at.folders.length ? <div className="empty small faint">No folders inside.</div> : null}
        </div>
        <div className="small muted">{at?.path ? `${at.audio} audio file${at.audio === 1 ? "" : "s"} right here; folders inside are read too.` : "Pick a drive or place, then the folder your music is in."}</div>
        <div className="actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!at?.path} onClick={() => at?.path && onPick(at.path)}>
            Use this folder
          </button>
        </div>
      </div>
    </div>
  );
}
