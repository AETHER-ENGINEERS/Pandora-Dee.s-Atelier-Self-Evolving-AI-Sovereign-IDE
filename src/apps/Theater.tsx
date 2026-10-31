import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Film, FolderInput, MoreHorizontal, Pencil, RefreshCw, Search, Star, Trash2, Upload, X } from "lucide-react";
import { desk, useDesk } from "../lib/store.ts";
import { downloadToDevice, fileApi } from "../lib/explorer.ts";
import {
  backUp,
  cancelJob,
  clearFinished,
  leftOff,
  lengthText,
  makeThumbs,
  patchVideo,
  refreshLibrary,
  rememberPosition,
  retryJob,
  sizeText,
  theaterApi,
  thumbUrl,
  useJobs,
  useLibrary,
  videoUrl,
  type Video,
} from "../lib/theater.ts";
import { openMenuAt, type MenuItem } from "../ui/ContextMenu.tsx";
import { askText } from "../ui/Ask.tsx";
import { useWidth } from "../ui/hooks.ts";

const ALL = "\u0000all", FAVS = "\u0000favs";
const SHELF_KEY = "pdd-theater-shelf";
/** The shelf this device backs up to (each phone remembers its own). */
const savedShelf = () => {
  try {
    return localStorage.getItem(SHELF_KEY) ?? "";
  } catch {
    return "";
  }
};
const month = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "long", year: "numeric" });

export function TheaterApp() {
  const { lib, error } = useLibrary();
  const toddler = useDesk((s) => s.toddler);
  const jobs = useJobs();
  const [shelf, setShelf] = useState(ALL);
  const [q, setQ] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const [target, setTarget] = useState(savedShelf);
  const pick = useRef<HTMLInputElement>(null);
  const [ref, width] = useWidth<HTMLDivElement>();
  const narrow = width < 560;

  useEffect(() => {
    void refreshLibrary();
  }, []);

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (lib?.videos ?? []).filter(
      (v) => (shelf === ALL || (shelf === FAVS ? v.fav : v.shelf === shelf)) && words.every((w) => `${v.name} ${v.shelf}`.toLowerCase().includes(w)),
    );
  }, [lib, shelf, q]);

  // thumbnails for the ones still without, a few at a time as the list changes
  useEffect(() => {
    if (shown.some((v) => v.thumb === 0)) void makeThumbs(shown.slice(0, 200));
  }, [shown]);

  const groups = useMemo(() => {
    const out: { label: string; videos: Video[] }[] = [];
    for (const v of shown) {
      const label = month(v.mtime);
      if (out.at(-1)?.label === label) out.at(-1)!.videos.push(v);
      else out.push({ label, videos: [v] });
    }
    return out;
  }, [shown]);

  const chooseTarget = async (value: string) => {
    let s = value;
    if (value === "\u0000new") {
      const name = await askText("A new shelf", "", { body: "A shelf is a folder in Vault › Videos, such as someone's name or a project.", placeholder: "Kai's films", yes: "Make it" });
      if (!name?.trim()) return;
      try {
        s = (await theaterApi.shelf(name)).shelf;
        await refreshLibrary();
      } catch (e) {
        return desk().say(e instanceof Error ? e.message : String(e));
      }
    }
    setTarget(s);
    try {
      localStorage.setItem(SHELF_KEY, s);
    } catch {
      /* it just won't remember */
    }
  };

  const take = async (files: File[]) => {
    const n = await backUp(files, target);
    if (!n) desk().say("Those aren't videos the Theater keeps (mp4, mov, webm, mkv…).");
  };

  const shelves = (lib?.shelves ?? []).filter((s) => s !== "From devices");
  const current = playing ? (lib?.videos.find((v) => v.id === playing) ?? null) : null;

  return (
    <div
      ref={ref}
      className={`theater${narrow ? " narrow" : ""}`}
      onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        void take([...e.dataTransfer.files]);
      }}
    >
      <div className="theater-top">
        <div className="theater-search">
          <Search size={15} />
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a video" aria-label="Find a video" />
        </div>
        <button className="btn primary" onClick={() => pick.current?.click()} title="Copies videos from this device onto the desktop, checked piece by piece">
          <Upload size={15} /> {narrow ? "Back up" : "Back up videos"}
        </button>
        <label className="theater-to small">
          <span className="faint">to</span>
          <select className="input" value={target} onChange={(e) => void chooseTarget(e.target.value)} aria-label="Shelf to back up to">
            <option value="">Videos</option>
            {shelves.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            {target && !shelves.includes(target) ? <option value={target}>{target}</option> : null}
            <option value={"\u0000new"}>New shelf…</option>
          </select>
        </label>
        <button className="btn small ghost" onClick={() => void refreshLibrary()} title="Look again" aria-label="Look again">
          <RefreshCw size={14} />
        </button>
        <input
          ref={pick}
          type="file"
          accept="video/*"
          multiple
          hidden
          onChange={(e) => {
            const f = [...(e.target.files ?? [])];
            e.target.value = "";
            if (f.length) void take(f);
          }}
        />
      </div>

      <div className="theater-shelves" role="tablist" aria-label="Shelves">
        {[
          [ALL, "All"],
          [FAVS, "★ Favourites"],
          ...(lib?.shelves ?? []).map((s) => [s, s]),
        ].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={shelf === id} className={`chip${shelf === id ? " focus" : ""}`} onClick={() => setShelf(id)}>
            {label}
          </button>
        ))}
      </div>

      {jobs.length ? <Uploads /> : null}

      <div className="theater-list">
        {error ? <p className="small bad-text">{error}</p> : null}
        {lib && !lib.videos.length ? (
          <div className="theater-empty">
            <Film size={42} />
            <p>
              <b>No videos here yet.</b>
            </p>
            <p className="small muted">
              On a phone, open the desktop's address and press <b>Back up videos</b>: they're copied here in checked pieces, and once each one says
              <b> Safe on the desktop</b>, the phone can let go of it. On this computer you can drop videos here, or put them in Vault › Videos.
            </p>
          </div>
        ) : null}
        {lib && lib.videos.length && !shown.length ? <p className="small muted">Nothing on this shelf{q ? " matches" : " yet"}.</p> : null}
        {groups.map((g) => (
          <section key={g.label}>
            <h3 className="theater-month">{g.label}</h3>
            <div className="theater-grid">
              {g.videos.map((v) => (
                <Card key={v.id} v={v} onPlay={() => setPlaying(v.id)} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {current ? (
        <Player
          v={current}
          list={shown}
          toddler={toddler}
          shelves={shelves}
          onPick={(id) => setPlaying(id)}
          onClose={() => setPlaying(null)}
        />
      ) : null}
    </div>
  );
}

function Card({ v, onPlay }: { v: Video; onPlay: () => void }) {
  const at = leftOff(v.id);
  return (
    <button className="theater-card" onClick={onPlay} title={`${v.name} · ${sizeText(v.size)}${v.shelf ? ` · ${v.shelf}` : ""}`}>
      <span className="theater-thumb">
        {v.thumb === 1 ? <img src={thumbUrl(v.id)} alt="" loading="lazy" /> : <Film size={30} />}
        {v.seconds ? <span className="theater-len">{lengthText(v.seconds)}</span> : null}
        {v.fav ? <Star className="theater-fav" size={15} fill="currentColor" /> : null}
        {at && v.seconds ? <span className="theater-progress" style={{ width: `${Math.min(100, (at / v.seconds) * 100)}%` }} /> : null}
      </span>
      <span className="theater-name">{v.name}</span>
    </button>
  );
}

function Player({ v, list, toddler, shelves, onPick, onClose }: { v: Video; list: Video[]; toddler: boolean; shelves: string[]; onPick: (id: string) => void; onClose: () => void }) {
  const vid = useRef<HTMLVideoElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  const i = list.findIndex((x) => x.id === v.id);
  const prev = i > 0 ? list[i - 1] : null;
  const next = i >= 0 && i < list.length - 1 ? list[i + 1] : null;

  // carry on from where it was left on this device, and remember as it plays
  useEffect(() => {
    const el = vid.current;
    if (!el) return;
    const from = leftOff(v.id);
    const start = () => {
      if (from && el.duration && from < el.duration - 8) el.currentTime = from;
      void el.play().catch(() => {});
    };
    el.addEventListener("loadedmetadata", start, { once: true });
    const save = () => rememberPosition(v.id, el.currentTime, el.duration || v.seconds);
    const t = setInterval(save, 4000);
    return () => {
      clearInterval(t);
      save();
      el.removeEventListener("loadedmetadata", start);
    };
  }, [v.id, v.seconds]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const fav = async () => {
    try {
      patchVideo(v.id, { fav: (await theaterApi.fav(v.id, !v.fav)).fav });
    } catch (e) {
      desk().say(e instanceof Error ? e.message : String(e));
    }
  };

  const menu = (): MenuItem[] => {
    const items: MenuItem[] = [{ label: "Save a copy to this device", icon: <Download size={14} />, run: () => downloadToDevice(v.path) }];
    if (toddler) return items;
    const act = (fn: () => Promise<unknown>, said: string) => async () => {
      try {
        await fn();
        desk().say(said);
        await refreshLibrary();
      } catch (e) {
        desk().say(e instanceof Error ? e.message : String(e));
      }
    };
    return [
      ...items,
      {
        label: "Rename…",
        icon: <Pencil size={14} />,
        run: async () => {
          const name = await askText("Rename", v.name, { yes: "Rename" });
          if (name?.trim() && name.trim() !== v.name) void act(() => fileApi.rename(v.path, `${name.trim()}.${v.ext}`), `Renamed to ${name.trim()}.`)();
        },
      },
      { heading: "Move to shelf" },
      ...["", ...shelves]
        .filter((s) => s !== v.shelf)
        .map((s): MenuItem => ({ label: s || "Videos (no shelf)", icon: <FolderInput size={14} />, run: () => void act(() => theaterApi.move(v.path, s), `Moved to ${s || "Videos"}.`)() })),
      { sep: true },
      {
        label: "Move to the trash",
        icon: <Trash2 size={14} />,
        danger: true,
        run: () => {
          onClose();
          void act(() => fileApi.trash(v.path), `${v.name} went to the trash (Explorer › Trash puts it back).`)();
        },
      },
    ];
  };

  return (
    <div className="theater-player" role="dialog" aria-label={v.name}>
      <div className="theater-bar">
        <button className="btn ghost" onClick={onClose} aria-label="Back to the videos" title="Back (Esc)">
          <X size={18} />
        </button>
        <span className="theater-title" title={v.name}>
          {v.name}
          {v.shelf ? <span className="faint small"> · {v.shelf}</span> : null}
        </span>
        <button className={`btn ghost${v.fav ? " on" : ""}`} onClick={() => void fav()} aria-pressed={v.fav} aria-label={v.fav ? "Not a favourite" : "Favourite"} title="Favourite">
          <Star size={18} fill={v.fav ? "currentColor" : "none"} />
        </button>
        <button ref={more} className="btn ghost" onClick={() => more.current && openMenuAt(more.current, menu())} aria-label="More" title="More">
          <MoreHorizontal size={18} />
        </button>
      </div>
      <video key={v.id} ref={vid} className="theater-video" src={videoUrl(v)} controls playsInline onEnded={() => next && onPick(next.id)} />
      <div className="theater-nav">
        <button className="btn ghost" disabled={!prev} onClick={() => prev && onPick(prev.id)} aria-label="Previous video">
          <ChevronLeft size={18} /> {prev ? <span className="theater-nav-name">{prev.name}</span> : null}
        </button>
        <span className="small faint">
          {i + 1} of {list.length} · {sizeText(v.size)}
        </span>
        <button className="btn ghost" disabled={!next} onClick={() => next && onPick(next.id)} aria-label="Next video">
          {next ? <span className="theater-nav-name">{next.name}</span> : null} <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}

/** What this device is backing up, and what's safe to let go of. */
function Uploads() {
  const jobs = useJobs();
  const safe = jobs.filter((j) => j.state === "done" || j.state === "kept");
  const busy = jobs.filter((j) => !["done", "kept", "failed"].includes(j.state));
  const total = busy.reduce((n, j) => n + j.file.size, 0), sent = busy.reduce((n, j) => n + j.sent, 0);
  const [open, setOpen] = useState(true);
  return (
    <div className="theater-uploads">
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <b className="small">
          {busy.length ? `Backing up ${busy.length} video${busy.length === 1 ? "" : "s"} · ${sizeText(sent)} of ${sizeText(total)}` : "Backed up"}
        </b>
        {safe.length ? (
          <span className="small good-text">
            {safe.length} safe on the desktop{busy.length ? "" : ": this device can let go of them"}
          </span>
        ) : null}
        <span style={{ flex: 1 }} />
        <button className="btn small ghost" onClick={() => setOpen(!open)}>
          {open ? "Hide" : "Show"}
        </button>
        {safe.length && !busy.length ? (
          <button className="btn small" onClick={clearFinished}>
            Done
          </button>
        ) : null}
      </div>
      {busy.length ? <div className="theater-bar-total"><span style={{ width: `${total ? (sent / total) * 100 : 0}%` }} /></div> : null}
      {open ? (
        <>
          {busy.length ? <p className="small faint" style={{ margin: "4px 0" }}>Keep this page open until it's done. If the Wi-Fi drops, it carries on from where it got to.</p> : null}
          {safe.length && !busy.length ? (
            <p className="small muted" style={{ margin: "4px 0" }}>
              Each one arrived whole{crypto.subtle ? ", checked piece by piece" : ""}. To free the space, delete them in this phone's Gallery or Photos app (and
              empty its “Recently deleted”). You can watch them here any time.
            </p>
          ) : null}
          <ul className="theater-jobs">
            {jobs.map((j) => (
              <li key={j.key}>
                <span className="theater-job-name" title={j.file.name}>
                  {j.file.name}
                </span>
                <span className={`small ${j.state === "failed" ? "bad-text" : j.state === "done" || j.state === "kept" ? "good-text" : "faint"}`}>
                  {j.state === "checking"
                    ? "Checking…"
                    : j.state === "waiting"
                      ? `Waiting · ${sizeText(j.file.size)}`
                      : j.state === "sending"
                        ? j.error || `${Math.floor((j.sent / j.file.size) * 100)}% of ${sizeText(j.file.size)}`
                        : j.state === "done"
                          ? "✓ Safe on the desktop"
                          : j.state === "kept"
                            ? "✓ Already on the desktop"
                            : j.error}
                </span>
                {j.state === "failed" ? (
                  <button className="btn small" onClick={() => retryJob(j)}>
                    Try again
                  </button>
                ) : null}
                {j.state !== "done" && j.state !== "kept" ? (
                  <button className="btn small ghost" onClick={() => cancelJob(j)} aria-label={`Stop backing up ${j.file.name}`}>
                    <X size={13} />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
