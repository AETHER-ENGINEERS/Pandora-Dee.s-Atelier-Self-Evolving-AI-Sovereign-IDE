import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { sizeText } from "../lib/theater.ts";

type Engine = { id?: string; name: string; path: string; about?: string };
type Download = {
  id: string;
  name: string;
  about: string;
  available: boolean;
  installed: string | null;
  latest: { version: string; name: string; size: number; sha256: string; published: string } | null;
  busy: boolean;
  stage: string;
  got: number;
  total: number;
  error: string;
  program: string;
};
type Status = { running: boolean; engine: string; using: Engine | null; chosen: string; installed: Engine[]; downloaded: Engine[]; downloads: Download[]; error: string; canChange: boolean };

async function call<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `The desktop answered ${r.status}.`);
  return j as T;
}

/** Which engine the full browser runs: downloaded ones (checked), every Chromium-family browser on the computer, or
 *  any browser program picked by hand. Changed only on the desktop's own computer. */
export function EnginePanel({ onClose, onRestarted, embedded = false }: { onClose: () => void; onRestarted: (urls: string[]) => void; embedded?: boolean }) {
  const [s, setS] = useState<Status | null>(null);
  const [err, setErr] = useState("");
  const [custom, setCustom] = useState("");
  const load = () => call<Status>("/api/engine/status").then(setS, (e: Error) => setErr(e.message));

  useEffect(() => {
    void load();
  }, []);

  // while one downloads, look every second; when it's done, the browser starts again on it
  const busy = s?.downloads.some((d) => d.busy);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => {
      void call<Status>("/api/engine/status").then((n) => {
        setS(n);
        if (!n.downloads.some((d) => d.busy) && !n.downloads.some((d) => d.error)) onRestarted([]);
      });
    }, 1000);
    return () => clearInterval(t);
  }, [busy, onRestarted]);

  const act = async (fn: () => Promise<unknown>) => {
    setErr("");
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    await load();
  };
  const choose = (path: string, extra: Record<string, unknown> = {}) => void act(async () => onRestarted((await call<{ reopen: string[] }>("/api/engine/choose", { path, ...extra })).reopen));

  if (!s) return null;
  const can = s.canChange;
  const choices: Engine[] = [...s.downloaded, ...s.installed];
  const pickedByHand = s.chosen && !choices.some((e) => e.path === s.chosen);

  return (
    <div className={embedded ? "" : "engine-panel"} role={embedded ? undefined : "dialog"} aria-label="The browser's engine">
      <div className="row" style={{ alignItems: "center" }}>
        <b className="grow">The browser's engine</b>
        {embedded ? null : (
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={14} />
          </button>
        )}
      </div>
      <p className="small muted" style={{ margin: "4px 0 8px" }}>
        Pages are opened by a real browser running on the desktop's computer, each with its own profile there (never anyone's personal browser). Any
        Chromium-family browser can do it; Firefox and Safari can't be shown live here.
        {s.using ? (
          <>
            {" "}
            Now: <b>{s.using.name}</b>.
          </>
        ) : null}
      </p>

      {s.downloads
        .filter((d) => d.available || d.installed)
        .map((d) => (
          <div key={d.id} className="engine-own" style={{ marginBottom: 8 }}>
            <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <b className="small grow">{d.name}</b>
              <span className="small faint">{d.installed ? `version ${d.installed}` : "not downloaded"}</span>
            </div>
            <p className="small faint" style={{ margin: "2px 0 6px" }}>
              {d.about} Downloaded from its project's releases on GitHub and checked against GitHub's SHA-256; kept in the desktop's data folder only.
            </p>
            {d.busy ? (
              <>
                <div className="small">{d.stage}</div>
                {d.total ? (
                  <div className="theater-bar-total" aria-label="Download progress">
                    <span style={{ width: `${(d.got / d.total) * 100}%` }} />
                  </div>
                ) : null}
                {d.total ? <div className="small faint">{`${sizeText(d.got)} of ${sizeText(d.total)}`}</div> : null}
              </>
            ) : (
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                <button className="btn small primary" disabled={!can || busy} onClick={() => void act(() => call("/api/engine/download", { id: d.id, op: "install" }))}>
                  {d.installed ? "Get the newest" : `Download ${d.name}`}
                  {d.latest ? ` (${d.latest.version}, ${sizeText(d.latest.size)})` : ""}
                </button>
                <button className="btn small" disabled={!can} onClick={() => void act(() => call("/api/engine/download", { id: d.id, op: "check" }))}>
                  Check for a newer one
                </button>
                {d.installed ? (
                  <button className="btn small danger-text" disabled={!can} onClick={() => void act(async () => (await call("/api/engine/download", { id: d.id, op: "remove" }), onRestarted([])))}>
                    Remove
                  </button>
                ) : null}
              </div>
            )}
            {d.latest && !d.busy ? (
              <div className="small faint" style={{ marginTop: 4 }}>
                Newest: {d.latest.version}
                {d.installed && d.installed === d.latest.version ? " (you have it)" : ""}.
              </div>
            ) : null}
            {!d.busy && d.stage ? <div className="small good-text">{d.stage}</div> : null}
            {d.error ? <div className="small bad-text">{d.error}</div> : null}
          </div>
        ))}

      <div className="field" style={{ marginTop: 6 }}>
        <span className="small">Use</span>
        <label className="check small">
          <input type="radio" name="engine" disabled={!can} checked={!s.chosen} onChange={() => choose("")} />
          <span>Automatic: the one in use, until another is chosen or downloaded</span>
        </label>
        {choices.map((e) => (
          <label key={e.path} className="check small" title={e.path}>
            <input type="radio" name="engine" disabled={!can} checked={s.chosen === e.path} onChange={() => choose(e.path)} />
            <span>
              {e.name}
              {e.about ? <span className="faint"> · {e.about}</span> : null}
            </span>
          </label>
        ))}
        {pickedByHand ? (
          <label className="check small" title={s.chosen}>
            <input type="radio" name="engine" checked readOnly />
            <span>
              {s.using?.name ?? "A program you picked"} <span className="faint">· {s.chosen}</span>
            </span>
          </label>
        ) : null}
      </div>
      {can ? (
        <div className="field small" style={{ marginTop: 4 }}>
          <span>Another Chromium-family browser on this computer (its program file)</span>
          <div className="row" style={{ gap: 6 }}>
            <input className="input grow" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="C:\Program Files\…\browser.exe" aria-label="Browser program path" spellCheck={false} />
            <button className="btn small" disabled={!custom.trim()} onClick={() => (choose(custom.trim().replace(/^"|"$/g, ""), { custom: true }), setCustom(""))}>
              Use it
            </button>
          </div>
        </div>
      ) : (
        <p className="small faint">The engine can only be changed on the desktop's own computer.</p>
      )}
      {err || s.error ? <p className="small bad-text">{err || s.error}</p> : null}
    </div>
  );
}
