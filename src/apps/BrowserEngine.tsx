import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { sizeText } from "../lib/theater.ts";

type Engine = { name: string; path: string };
type Ungoogled = {
  installed: string | null;
  latest: { version: string; name: string; size: number; sha256: string; published: string } | null;
  busy: boolean;
  stage: string;
  got: number;
  total: number;
  error: string;
  where: string;
};
type Status = { running: boolean; engine: string; using: Engine | null; chosen: string; installed: Engine[]; error: string; ungoogled: Ungoogled; canChange: boolean };

async function call<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `The desktop answered ${r.status}.`);
  return j as T;
}

/** Which engine the full browser runs, and fetching Ungoogled Chromium (only changed on the desktop's own computer). */
export function EnginePanel({ onClose, onRestarted }: { onClose: () => void; onRestarted: (urls: string[]) => void }) {
  const [s, setS] = useState<Status | null>(null);
  const [err, setErr] = useState("");
  const load = () => call<Status>("/api/engine/status").then(setS, (e: Error) => setErr(e.message));

  useEffect(() => {
    void load();
  }, []);

  // while it downloads, look every second; when it's done, the browser starts again on the new engine
  const busy = s?.ungoogled.busy;
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => {
      void call<Status>("/api/engine/status").then((n) => {
        setS(n);
        if (!n.ungoogled.busy && !n.ungoogled.error) onRestarted([]);
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

  if (!s) return null;
  const u = s.ungoogled;
  const ownName = "Ungoogled Chromium";
  const can = s.canChange;

  return (
    <div className="engine-panel" role="dialog" aria-label="The browser's engine">
      <div className="row" style={{ alignItems: "center" }}>
        <b className="grow">The browser's engine</b>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <p className="small muted" style={{ margin: "4px 0 8px" }}>
        Pages are opened by a real browser running on the desktop's computer, with its own profile there (never anyone's personal browser).
        {s.using ? (
          <>
            {" "}
            Now: <b>{s.using.name}</b>.
          </>
        ) : null}
      </p>

      <div className="engine-own">
        <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <b className="small grow">{ownName}</b>
          <span className="small faint">{u.installed ? `version ${u.installed}` : "not downloaded"}</span>
        </div>
        <p className="small faint" style={{ margin: "2px 0 6px" }}>
          Chromium with Google's services taken out: nothing sent to Google, no sign-in to Google, no Google updates. It lives in the desktop's data folder
          only. Sites that need DRM (Netflix, Spotify's web player) won't play in it.
        </p>
        {u.busy ? (
          <>
            <div className="small">{u.stage}</div>
            {u.total ? (
              <div className="theater-bar-total" aria-label="Download progress">
                <span style={{ width: `${(u.got / u.total) * 100}%` }} />
              </div>
            ) : null}
            {u.total ? <div className="small faint">{`${sizeText(u.got)} of ${sizeText(u.total)}`}</div> : null}
          </>
        ) : (
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <button className="btn small primary" disabled={!can} onClick={() => void act(() => call("/api/engine/ungoogled", { op: "install" }))}>
              {u.installed ? "Get the newest" : `Download ${ownName}`}
              {u.latest ? ` (${u.latest.version}, ${sizeText(u.latest.size)})` : ""}
            </button>
            <button className="btn small" disabled={!can} onClick={() => void act(() => call("/api/engine/ungoogled", { op: "check" }))}>
              Check for a newer one
            </button>
            {u.installed ? (
              <button className="btn small danger-text" disabled={!can} onClick={() => void act(async () => (await call("/api/engine/ungoogled", { op: "remove" }), onRestarted([])))}>
                Remove
              </button>
            ) : null}
          </div>
        )}
        {u.latest && !u.busy ? (
          <div className="small faint" style={{ marginTop: 4 }}>
            Newest: {u.latest.version}
            {u.installed && u.installed === u.latest.version ? " (you have it)" : ""}. Checked against GitHub's SHA-256 before it's used.
          </div>
        ) : null}
        {!u.busy && u.stage ? <div className="small good-text">{u.stage}</div> : null}
        {u.error ? <div className="small bad-text">{u.error}</div> : null}
      </div>

      <div className="field" style={{ marginTop: 10 }}>
        <span className="small">Use</span>
        <label className="check small">
          <input type="radio" name="engine" disabled={!can} checked={!s.chosen} onChange={() => void act(async () => onRestarted((await call<{ reopen: string[] }>("/api/engine/choose", { path: "" })).reopen))} />
          <span>Automatic: {ownName} when it's here, otherwise the most private browser installed</span>
        </label>
        {s.installed.map((e) => (
          <label key={e.path} className="check small">
            <input type="radio" name="engine" disabled={!can} checked={s.chosen === e.path} onChange={() => void act(async () => onRestarted((await call<{ reopen: string[] }>("/api/engine/choose", { path: e.path })).reopen))} />
            <span>{e.name}</span>
          </label>
        ))}
      </div>
      {!can ? <p className="small faint">The engine can only be changed on the desktop's own computer.</p> : null}
      {err || s.error ? <p className="small bad-text">{err || s.error}</p> : null}
    </div>
  );
}
