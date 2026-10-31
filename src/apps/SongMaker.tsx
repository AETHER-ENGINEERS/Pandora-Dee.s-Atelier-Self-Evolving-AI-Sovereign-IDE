import { useState } from "react";
import { create } from "zustand";
import { Music4, Pause, Play, Settings2, Sparkles, Square, Wand2, X } from "lucide-react";
import { desk, useDesk } from "../lib/store.ts";
import { fetchKept, keepSong, keptSongs, makeSong, resumeSong, uid, writeSong, type MadeAudio, type SongAsk } from "../lib/media.ts";
import { current, playList, toggle, useMusic, type Track } from "../lib/music.ts";
import type { MadeSong, PendingSong, SongEngine } from "../lib/mediaPrefs.ts";
import { CharacterPicker } from "./Files.tsx";
import { EnginesDialog } from "./Engines.tsx";
import { openMenu } from "../ui/ContextMenu.tsx";
import { openSongInfo } from "../ui/SongInfo.tsx";
import { copyText } from "../lib/clipboard.ts";

/**
 * Making songs, the Suno/Udio way: describe it and a character writes the words, or write the title, style and
 * lyrics yourself; the song engine (ACE-Step or YuE2, usually on another computer) makes it, and it lands in the
 * music library.
 */

type Job = { id: string; title: string; status: string; error?: string; ctl: AbortController };
const useJobs = create<{ jobs: Job[] }>(() => ({ jobs: [] }));
const setJob = (id: string, p: Partial<Job>) => useJobs.setState((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...p } : j)) }));
const dropJob = (id: string) => useJobs.setState((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) }));

const STYLES = ["pop", "rock", "indie", "lo-fi", "hip hop", "R&B", "jazz", "funk", "synthwave", "EDM", "house", "ambient", "orchestral", "folk", "country", "metal", "punk", "reggae", "latin", "J-pop", "piano ballad", "acoustic", "female vocals", "male vocals", "duet", "upbeat", "melancholic", "dreamy"];
const SECTIONS = ["[Intro]", "[Verse]", "[Pre-Chorus]", "[Chorus]", "[Bridge]", "[Solo]", "[Outro]"];

const pendingOf = () => desk().media.pending ?? [];
const setPending = (list: PendingSong[]) => desk().set({ media: { ...desk().media, pending: list } });

/** Run one song job: make (or pick up) the audio, put it in the library, and keep the list of pending songs right. */
function run(engine: SongEngine, ask: SongAsk, job: Job, getAudio: (progress: (s: string) => void, signal: AbortSignal) => Promise<MadeAudio>, done?: (s: MadeSong | null, error?: string) => void) {
  useJobs.setState((s) => ({ jobs: [job, ...s.jobs.filter((j) => j.id !== job.id)] }));
  void (async () => {
    try {
      const made = await getAudio((status) => setJob(job.id, { status }), job.ctl.signal);
      setJob(job.id, { status: "Adding it to the library…" });
      const song = await keepSong(ask, made, engine);
      setPending(pendingOf().filter((p) => p.id !== job.id));
      dropJob(job.id);
      done?.(song);
    } catch (e) {
      const error = job.ctl.signal.aborted ? "Stopped. (The engine may finish the job anyway.)" : e instanceof Error ? e.message : String(e);
      // given up here (stopped, or the engine failed): the bridge still keeps any song it finishes
      setPending(pendingOf().filter((p) => p.id !== job.id));
      setJob(job.id, { error });
      done?.(null, error);
    }
  })();
}

/** Make a song in the background (from here, or from a character's make_song tool); it shows in the list while it works. */
export function startSong(engine: SongEngine, ask: SongAsk, done?: (s: MadeSong | null, error?: string) => void) {
  const job: Job = { id: uid(), title: ask.title || "Untitled", status: "Starting…", ctl: new AbortController() };
  run(engine, ask, job, (progress, signal) =>
    makeSong(engine, ask, progress, signal, (ref, seed) =>
      // the engine took it as a job: remember it, so a reload or a closed tab doesn't lose the song
      setPending([...pendingOf(), { id: job.id, ref, seed, engineId: engine.id, ask: { title: ask.title, style: ask.style, lyrics: ask.lyrics, seconds: ask.seconds, instrumental: ask.instrumental }, at: Date.now() }]),
    ), done);
}

let resumed = false;
/** After the desktop opens again: pick up the songs engines were still making. */
export function resumeSongs() {
  if (resumed) return;
  resumed = true;
  for (const p of pendingOf()) {
    const engine = desk().media.songs.find((e) => e.id === p.engineId);
    if (!engine) {
      setPending(pendingOf().filter((x) => x.id !== p.id));
      continue;
    }
    const job: Job = { id: p.id, title: p.ask.title || "Untitled", status: "Picking up where it left off…", ctl: new AbortController() };
    run(engine, p.ask, job, (progress, signal) => resumeSong(engine, p.ref, p.seed, progress, signal));
  }
}

type Draft = { title: string; style: string; lyrics: string; instrumental: boolean; seconds: number; seed: string };
let kept: Draft = { title: "", style: "", lyrics: "", instrumental: false, seconds: 120, seed: "" };

export function SongMaker() {
  const media = useDesk((s) => s.media);
  const engines = media.songs.filter((e) => e.enabled);
  const [engineId, setEngineId] = useState(() => sessionStorage.getItem("pdd-song-engine") || "");
  const engine = engines.find((e) => e.id === engineId) ?? engines[0];
  const [mode, setMode] = useState<"simple" | "custom">(() => (sessionStorage.getItem("pdd-song-mode") as "simple" | "custom") || "simple");
  const [desc, setDesc] = useState("");
  const [writer, setWriter] = useState(() => desk().focus || "dee");
  const [d, setD] = useState<Draft>(kept);
  const [writing, setWriting] = useState(false);
  const [note, setNote] = useState("");
  const [setup, setSetup] = useState(false);
  const jobs = useJobs((s) => s.jobs);
  const set = (p: Partial<Draft>) => setD((x) => (kept = { ...x, ...p }));
  const update = (f: (x: Draft) => Partial<Draft>) => setD((x) => (kept = { ...x, ...f(x) }));
  const pickMode = (m: "simple" | "custom") => (setMode(m), sessionStorage.setItem("pdd-song-mode", m));

  const write = async (about: string, instrumental: boolean) => {
    setWriting(true);
    setNote("");
    try {
      const w = await writeSong(writer, about, instrumental);
      set({ title: w.title, style: w.style, lyrics: w.lyrics, instrumental });
      return w;
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setWriting(false);
    }
  };

  const start = (ask: SongAsk) => (engine ? startSong(engine, ask) : setSetup(true));

  const go = async () => {
    if (mode === "simple") {
      if (!desc.trim()) return;
      const w = await write(desc, d.instrumental);
      if (w) start({ title: w.title, style: w.style, lyrics: w.lyrics, seconds: d.seconds, instrumental: d.instrumental });
      return;
    }
    if (!d.style.trim()) return setNote("Give it a style of music first.");
    start({ title: d.title.trim(), style: d.style.trim(), lyrics: d.lyrics, seconds: d.seconds, instrumental: d.instrumental, seed: d.seed ? Number(d.seed) : undefined });
  };

  const insert = (tag: string) => update((x) => ({ lyrics: `${x.lyrics.replace(/\s*$/, "")}${x.lyrics.trim() ? "\n\n" : ""}${tag}\n` }));
  const addStyle = (s: string) => update((x) => ({ style: x.style.trim() ? `${x.style.replace(/[,\s]*$/, "")}, ${s}` : s }));

  return (
    <div className="songmaker">
      <div className="songmaker-form">
        <div className="row">
          <div className="seg" role="tablist">
            <button role="tab" aria-selected={mode === "simple"} className={mode === "simple" ? "on" : ""} onClick={() => pickMode("simple")}>Simple</button>
            <button role="tab" aria-selected={mode === "custom"} className={mode === "custom" ? "on" : ""} onClick={() => pickMode("custom")}>Custom</button>
          </div>
          <select className="select" value={engine?.id ?? ""} onChange={(e) => (setEngineId(e.target.value), sessionStorage.setItem("pdd-song-engine", e.target.value))} aria-label="Song engine">
            {engines.length ? engines.map((e) => <option key={e.id} value={e.id}>{e.name}</option>) : <option value="">No song engine yet</option>}
          </select>
          <button className="icon-btn" data-tip="Song engines" aria-label="Song engines" onClick={() => setSetup(true)}>
            <Settings2 size={15} />
          </button>
        </div>
        {!engines.length ? (
          <div className="note small">
            Add the server that makes the songs: mlx-serve / MLX Core or ACE-Step 1.5 (good on a Mac), or YuE2 in ComfyUI. <button className="btn small" onClick={() => setSetup(true)}>Add one</button>
          </div>
        ) : null}

        {mode === "simple" ? (
          <>
            <label className="small muted" htmlFor="song-desc">Song description</label>
            <textarea id="song-desc" className="input" rows={5} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="A dreamy synthwave song about driving home at 3 a.m. with the city lights fading behind" />
            <div className="row small">
              <span className="muted">Written by</span>
              <CharacterPicker value={writer} onChange={setWriter} />
            </div>
          </>
        ) : (
          <>
            <input className="input" value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="Title" aria-label="Title" />
            <label className="small muted" htmlFor="song-style">Style of music</label>
            <textarea id="song-style" className="input" rows={2} value={d.style} onChange={(e) => set({ style: e.target.value })} placeholder="dreamy synthwave, female vocals, slow, analog synths, reverb" />
            <div className="chips">
              {STYLES.map((s) => (
                <button key={s} className="chip" onClick={() => addStyle(s)}>{s}</button>
              ))}
            </div>
            {!d.instrumental ? (
              <>
                <div className="row">
                  <label className="small muted grow" htmlFor="song-lyrics">Lyrics</label>
                  <button className="btn small" disabled={writing} onClick={() => void write(`${d.title ? `A song called "${d.title}". ` : ""}${d.style ? `Style: ${d.style}. ` : ""}${d.lyrics.trim() ? `Keep and build on this:\n${d.lyrics}` : ""}`.trim() || "A song about today.", false)}>
                    <Wand2 size={13} /> {writing ? "Writing…" : "Write them"}
                  </button>
                </div>
                <textarea id="song-lyrics" className="input mono small" rows={10} value={d.lyrics} onChange={(e) => set({ lyrics: e.target.value })} placeholder={"[Verse]\n…\n\n[Chorus]\n…"} />
                <div className="chips">
                  {SECTIONS.map((s) => (
                    <button key={s} className="chip mono" onClick={() => insert(s)}>{s}</button>
                  ))}
                </div>
                <div className="row small">
                  <span className="muted">Words by</span>
                  <CharacterPicker value={writer} onChange={setWriter} />
                </div>
              </>
            ) : null}
            <input className="input small" value={d.seed} onChange={(e) => set({ seed: e.target.value.replace(/[^0-9]/g, "") })} placeholder="Seed (blank: a new one each time)" aria-label="Seed" />
          </>
        )}
        <label className="check small" style={{ padding: 0 }}>
          <input type="checkbox" checked={d.instrumental} onChange={(e) => set({ instrumental: e.target.checked })} />
          <span>Instrumental</span>
        </label>
        <div className="row small">
          <span className="muted">Length</span>
          <input className="grow" type="range" min={30} max={engine?.kind === "acestep" || engine?.kind === "mlx-serve" ? 360 : 240} step={10} value={d.seconds} onChange={(e) => set({ seconds: Number(e.target.value) })} aria-label="Length in seconds" />
          <span className="mono">{Math.floor(d.seconds / 60)}:{String(d.seconds % 60).padStart(2, "0")}</span>
        </div>
        <button className="btn primary" disabled={writing || !engine || (mode === "simple" ? !desc.trim() : !d.style.trim())} onClick={() => void go()}>
          <Sparkles size={14} /> {writing ? "Writing the words…" : "Create"}
        </button>
        {note ? <div className="small danger-text">{note}</div> : null}
        {engine?.kind === "yue2-comfyui" ? <div className="small faint">YuE2's songs are for non-commercial use (CC-BY-NC-4.0).</div> : null}
        {engine?.kind === "mlx-serve" && /minimax/i.test(engine.model ?? "") && d.instrumental ? <div className="small faint">MiniMax Music 3 is made for sung lyrics; for an instrumental, an ACE-Step model suits better.</div> : null}
      </div>
      <SongList made={media.made} jobs={jobs} onRemix={(s) => (pickMode("custom"), set({ title: s.title, style: s.style, lyrics: s.lyrics, instrumental: !s.lyrics, seconds: s.seconds, seed: String(s.seed) }))} />
      {setup ? <EnginesDialog type="songs" onClose={() => setSetup(false)} /> : null}
    </div>
  );
}

function SongList({ made, jobs, onRemix }: { made: MadeSong[]; jobs: Job[]; onRemix: (s: MadeSong) => void }) {
  const tracks = useMusic((s) => s.tracks);
  const own = useMusic((s) => s.own);
  const playing = useMusic((s) => s.playing);
  const cur = current();
  const [open, setOpen] = useState<string | null>(null);
  const trackOf = (s: MadeSong): Track | undefined => {
    const base = s.file.replace(/\.[^.]+$/, "");
    const mine = tracks.filter((t) => !own || t.folder === own);
    return mine.find((t) => t.title === base) ?? mine.find((t) => t.title === s.title);
  };
  const play = (s: MadeSong) => {
    const t = trackOf(s);
    if (!t) return desk().say("That song isn't in the music library any more.");
    if (cur?.kind === "track" && cur.id === t.id) return toggle();
    playList([{ kind: "track", ...t }]);
  };
  const forget = (id: string) => desk().set({ media: { ...desk().media, made: desk().media.made.filter((x) => x.id !== id) } });
  return (
    <div className="songlist">
      {jobs.map((j) => (
        <div key={j.id} className="made-song working">
          <div className="made-art"><Music4 size={20} /></div>
          <div className="grow">
            <b>{j.title}</b>
            <div className={`small ${j.error ? "danger-text" : "muted"}`}>{j.error ?? j.status}</div>
          </div>
          {j.error ? (
            <button className="icon-btn" aria-label="Dismiss" onClick={() => dropJob(j.id)}><X size={14} /></button>
          ) : (
            <button className="icon-btn" data-tip="Stop waiting" aria-label="Stop" onClick={() => j.ctl.abort()}><Square size={14} /></button>
          )}
        </div>
      ))}
      {!made.length && !jobs.length ? <div className="empty small faint">Songs you make show here, and in Songs with the rest of your music.</div> : null}
      {made.map((s) => {
        const t = trackOf(s);
        const on = cur?.kind === "track" && t && cur.id === t.id;
        const hue = [...s.title].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
        return (
          <div key={s.id} className={`made-song${on ? " on" : ""}`} onContextMenu={(e) => openMenu(e, [
            { heading: s.title },
            { label: "Play", run: () => play(s) },
            { label: "Remix (load into Custom)", run: () => onRemix(s) },
            { label: "Copy the lyrics", run: () => void copyText(s.lyrics), disabled: !s.lyrics },
            { label: "Properties…", run: () => openSongInfo({ track: t, made: s }) },
            { sep: true },
            { label: "Remove from this list", run: () => forget(s.id), hint: "The file stays in your library" },
          ])}>
            <button className="made-art" style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 60) % 360} 70% 30%))` }} aria-label={on && playing ? `Pause ${s.title}` : `Play ${s.title}`} onClick={() => play(s)}>
              {on && playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <div className="grow" style={{ minWidth: 0 }}>
              <b>{s.title}</b>
              <div className="small muted ellipsis" title={s.style}>{s.style}</div>
              <div className="small faint">{Math.floor(s.seconds / 60)}:{String(s.seconds % 60).padStart(2, "0")} · {s.engine} · {new Date(s.at).toLocaleDateString()}{t ? "" : " · not in the library"}</div>
              {open === s.id && s.lyrics ? <pre className="made-lyrics small">{s.lyrics}</pre> : null}
            </div>
            {s.lyrics ? <button className="btn small" onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? "Hide words" : "Words"}</button> : null}
            <button className="btn small" onClick={() => onRemix(s)}>Remix</button>
          </div>
        );
      })}
      <KeptOnEngines made={made} />
    </div>
  );
}

/** Songs the MLX Audio bridge kept on the Mac: every song it made, even one the desktop never got (a reload, a lost connection). */
function KeptOnEngines({ made }: { made: MadeSong[] }) {
  const engines = useDesk((s) => s.media.songs).filter((e) => e.enabled && e.kind === "mlx-serve");
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<Record<string, { name: string; size: number; made: number; about: string }[] | string>>({});
  const [busy, setBusy] = useState("");
  const load = () =>
    engines.forEach((e) =>
      keptSongs(e).then(
        (l) => setLists((x) => ({ ...x, [e.id]: l })),
        (err) => setLists((x) => ({ ...x, [e.id]: /404/.test(String(err)) ? "This engine doesn't keep songs (the newest mlx-music-bridge.py does)." : String(err instanceof Error ? err.message : err) })),
      ),
    );
  if (!engines.length) return null;
  const have = (name: string) => made.some((m) => name.endsWith(m.title));
  return (
    <details className="kept" open={open} onToggle={(e) => (setOpen(e.currentTarget.open), e.currentTarget.open && load())}>
      <summary className="small muted">Songs kept on the engine (every song it made, even ones the desktop missed)</summary>
      {engines.map((e) => {
        const l = lists[e.id];
        return (
          <div key={e.id} className="kept-engine">
            <div className="small faint">{e.name}</div>
            {l === undefined ? <div className="small faint">Asking…</div> : typeof l === "string" ? <div className="small faint">{l}</div> : !l.length ? <div className="small faint">None yet.</div> : null}
            {Array.isArray(l)
              ? l.map((k) => (
                  <div key={k.name} className="kept-song">
                    <span className="grow ellipsis" title={k.about}>{k.name}</span>
                    <span className="small faint">{(k.size / 1048576).toFixed(1)} MB</span>
                    <button
                      className="btn small"
                      disabled={busy === k.name}
                      onClick={() => {
                        setBusy(k.name);
                        fetchKept(e, k.name, k.about).then(
                          (s) => (setBusy(""), desk().say(`“${s.title}” is in your library.`)),
                          (err) => (setBusy(""), desk().say(err instanceof Error ? err.message : String(err))),
                        );
                      }}
                    >
                      {busy === k.name ? "Adding…" : have(k.name) ? "Add again" : "Add to library"}
                    </button>
                  </div>
                ))
              : null}
          </div>
        );
      })}
    </details>
  );
}
