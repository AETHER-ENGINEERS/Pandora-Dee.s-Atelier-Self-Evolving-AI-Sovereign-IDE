import { useEffect, useState } from "react";
import { create } from "zustand";
import type { Track } from "../lib/music.ts";
import type { MadeSong } from "../lib/mediaPrefs.ts";
import { copyText } from "../lib/clipboard.ts";

/** A song's Properties: the file (where, how big, how it's encoded) and, for a made song, what made it. */

type Info = Track & { path?: string; container?: string; codec?: string; sampleRate?: number; channels?: number; bitsPerSample?: number; lossless?: boolean; modified?: number; exists?: boolean; own?: boolean };
const useInfo = create<{ track?: Track; made?: MadeSong } | null>(() => null);

export const openSongInfo = (p: { track?: Track; made?: MadeSong }) => useInfo.setState(p, true);

const size = (n?: number) => (!n ? "" : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);
const length = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");

export function SongInfoHost() {
  const open = useInfo();
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setInfo(null);
    setError("");
    if (!open?.track) return;
    fetch(`/api/music/info?id=${encodeURIComponent(open.track.id)}`)
      .then(async (r) => (r.ok ? setInfo((await r.json()) as Info) : setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `It answered ${r.status}.`)))
      .catch((e) => setError(String(e)));
  }, [open?.track?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  const close = () => useInfo.setState(null, true);
  const t: Info | undefined = info ?? open.track;
  const m = open.made;
  const rows: [string, string | undefined][] = [
    ["Title", t?.title || m?.title],
    ["Artist", t?.artist],
    ["Album", t?.album],
    ["Year", t?.year ? String(t.year) : undefined],
    ["Genre", t?.genre],
    ["Length", length(t?.duration) || (m ? `${length(m.seconds)} asked` : undefined)],
    ["File", info?.path ? info.path.split(/[\\/]/).pop() : m?.file],
    ["Folder", info?.path ? info.path.replace(/[\\/][^\\/]*$/, "") : undefined],
    ["Size", size(info?.size ?? t?.size)],
    ["Format", [info?.container, info?.codec && info.codec !== info.container ? info.codec : "", info?.lossless ? "lossless" : ""].filter(Boolean).join(" · ")],
    ["Sound", [info?.sampleRate ? `${(info.sampleRate / 1000).toFixed(1)} kHz` : "", info?.channels ? (info.channels === 1 ? "mono" : info.channels === 2 ? "stereo" : `${info.channels} channels`) : "", info?.bitsPerSample ? `${info.bitsPerSample}-bit` : "", info?.bitrate ? `${Math.round(info.bitrate / 1000)} kbps` : ""].filter(Boolean).join(" · ")],
    ["Changed", info?.modified ? new Date(info.modified).toLocaleString() : undefined],
    ["Made with", m?.engine],
    ["Made on", m ? new Date(m.at).toLocaleString() : undefined],
    ["Style", m?.style],
    ["Seed", m ? String(m.seed) : undefined],
  ];
  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog song-info" role="dialog" aria-modal="true" aria-label="Song properties">
        <h2>{t?.title || m?.title || "Song"}</h2>
        {error ? <p className="small danger-text">{error}</p> : null}
        {info && info.exists === false ? <p className="small danger-text">The file isn't where it was when the library was last read.</p> : null}
        <dl className="props">
          {rows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd className={k === "Folder" || k === "File" ? "mono small" : undefined}>{v}</dd>
              </div>
            ))}
        </dl>
        {m?.lyrics ? (
          <details>
            <summary className="small">Lyrics</summary>
            <pre className="made-lyrics small">{m.lyrics}</pre>
          </details>
        ) : null}
        <div className="actions">
          {info?.path ? (
            <button className="btn" onClick={() => void copyText(info.path!)}>
              Copy the file's location
            </button>
          ) : null}
          <button className="btn primary" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
