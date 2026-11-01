import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { desk, useDesk } from "../lib/store.ts";
import { SEARCH_ENGINES, type BrowserPrefs } from "../lib/browserPrefs.ts";
import { EnginePanel } from "./BrowserEngine.tsx";

const setPrefs = (p: Partial<BrowserPrefs>) => desk().set({ browser: { ...desk().browser, ...p } });

export type Privacy = { trackers: boolean; banners: boolean; gpc: boolean; history: boolean; allow: string[] };

async function engine<T = { ok: boolean }>(body: Record<string, unknown>): Promise<T> {
  const r = await fetch("/api/engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `The desktop answered ${r.status}.`);
  return j as T;
}

/** The full browser's settings: how it starts, what it searches with, how pages look, privacy, and its engine. */
export function BrowserSettings({ onClose, onRestarted }: { onClose: () => void; onRestarted: (urls: string[]) => void }) {
  const b = useDesk((s) => s.browser);
  const searx = useDesk((s) => s.web.searx?.trim() ?? "");
  const [saved, setSaved] = useState(0);
  const [note, setNote] = useState("");
  const [priv, setPriv] = useState<Privacy | null>(null);
  const [list, setList] = useState<{ ready: boolean; trackers: number; error: string } | null>(null);
  const reopen = b.reopen !== false;

  useEffect(() => {
    void fetch("/api/engine/status")
      .then((r) => r.json())
      .then((s: { saved?: number; privacy?: Privacy; trackerList?: { ready: boolean; trackers: number; error: string } }) => {
        setSaved(s.saved ?? 0);
        setPriv(s.privacy ?? null);
        setList(s.trackerList ?? null);
      })
      .catch(() => undefined);
  }, []);

  const setPrivacy = (patch: Record<string, unknown>) =>
    void engine<{ privacy: Privacy; restartNeeded: boolean }>({ op: "privacy", ...patch }).then(
      (r) => {
        setPriv(r.privacy);
        setNote(r.restartNeeded ? "Saved. It applies from the next time the browser starts (the engine section's Use, or a desktop restart)." : "");
      },
      (e: Error) => setNote(e.message),
    );

  const act = (fn: () => Promise<unknown>, said: string) => () =>
    void fn().then(
      () => setNote(said),
      (e: Error) => setNote(e.message),
    );

  const searchValue = b.search === "searx" ? "searx" : SEARCH_ENGINES.some((e) => e.url === b.search) || !b.search ? (b.search ?? "") : "custom";

  return (
    <div className="engine-panel browser-settings" role="dialog" aria-label="Browser settings">
      <div className="row" style={{ alignItems: "center", marginBottom: 6 }}>
        <b className="grow">Browser settings</b>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      <section>
        <h4>When it starts</h4>
        <label className="check small">
          <input type="radio" name="bs-start" checked={reopen} onChange={() => (setPrefs({ reopen: true }), void engine({ op: "remember", on: true }))} />
          <span>Where I left off: the same tabs, each page scrolled back to where it was</span>
        </label>
        <label className="check small">
          <input type="radio" name="bs-start" checked={!reopen} onChange={() => (setPrefs({ reopen: false }), void engine({ op: "remember", on: false }))} />
          <span>The start page (nothing about open tabs is kept)</span>
        </label>
        <label className="field small">
          <span>Start page</span>
          <input className="input" value={b.home} onChange={(e) => setPrefs({ home: e.target.value })} aria-label="Start page" spellCheck={false} />
        </label>
        {reopen && saved ? (
          <button className="btn small" onClick={act(() => engine({ op: "forget" }).then(() => setSaved(0)), "Forgotten: next time it opens the start page.")}>
            Forget the {saved} saved tab{saved === 1 ? "" : "s"}
          </button>
        ) : null}
      </section>

      <section>
        <h4>Searching from the address bar</h4>
        <select
          className="select"
          value={searchValue}
          aria-label="Search engine"
          onChange={(e) => setPrefs({ search: e.target.value === "custom" ? b.search || "https://example.org/search?q=%s" : e.target.value || undefined })}
        >
          {SEARCH_ENGINES.map((e, i) => (
            <option key={e.url} value={i === 0 ? "" : e.url}>
              {e.name}
            </option>
          ))}
          {searx ? <option value="searx">Your SearXNG ({searx.replace(/^https?:\/\//, "")})</option> : null}
          <option value="custom">Another…</option>
        </select>
        {searchValue === "custom" ? (
          <input className="input" style={{ marginTop: 4 }} value={b.search ?? ""} onChange={(e) => setPrefs({ search: e.target.value })} aria-label="Search address, %s for the words" placeholder="https://example.org/search?q=%s" spellCheck={false} />
        ) : null}
      </section>

      <section>
        <h4>Pictures</h4>
        <p className="small faint" style={{ margin: "0 0 2px" }}>
          The page reaches this device as pictures. Lighter ones arrive faster: better for animations and video, a slower device (Firefox decodes more
          slowly) or a slow connection.
        </p>
        {(
          [
            ["sharp", "Sharp: this screen's full sharpness"],
            ["balanced", "Balanced: a little lighter (about a quarter less to send)"],
            ["smooth", "Smooth: half the size, a little softer"],
          ] as const
        ).map(([v, label]) => (
          <label key={v} className="check small">
            <input type="radio" name="bs-picture" checked={(b.picture ?? "sharp") === v} onChange={() => setPrefs({ picture: v })} />
            <span>{label}</span>
          </label>
        ))}
      </section>

      <section>
        <h4>Page colours</h4>
        {(
          [
            ["device", "As this device (light or dark)"],
            ["dark", "Dark"],
            ["light", "Light"],
          ] as const
        ).map(([v, label]) => (
          <label key={v} className="check small">
            <input type="radio" name="bs-scheme" checked={(b.scheme ?? "device") === v} onChange={() => setPrefs({ scheme: v })} />
            <span>{label}</span>
          </label>
        ))}
        <label className="check small">
          <input type="checkbox" checked={Boolean(b.darken)} onChange={(e) => setPrefs({ darken: e.target.checked })} />
          <span>Darken sites that have no dark look</span>
        </label>
      </section>

      <section>
        <h4>Privacy</h4>
        {priv ? (
          <>
            <label className="check small">
              <input type="checkbox" checked={priv.trackers} onChange={(e) => setPrivacy({ trackers: e.target.checked })} />
              <span>
                Block trackers (DuckDuckGo's open tracker list
                {list?.ready ? `, ${list.trackers} trackers` : list?.error ? `: ${list.error}` : ", fetched when first needed"})
              </span>
            </label>
            <label className="check small">
              <input type="checkbox" checked={priv.banners} onChange={(e) => setPrivacy({ banners: e.target.checked })} />
              <span>Say no to cookie banners (DuckDuckGo's autoconsent picks "reject" for you)</span>
            </label>
            <label className="check small">
              <input type="checkbox" checked={priv.gpc} onChange={(e) => setPrivacy({ gpc: e.target.checked })} />
              <span>Ask sites not to sell or share my data (Global Privacy Control)</span>
            </label>
            <label className="check small">
              <input type="checkbox" checked={priv.history} onChange={(e) => setPrivacy({ history: e.target.checked })} />
              <span>Keep browsing history (off: nothing of where you went is kept between starts)</span>
            </label>
            {priv.allow.length ? (
              <div className="small" style={{ marginTop: 4 }}>
                <span className="faint">Protection off for: </span>
                {priv.allow.map((site) => (
                  <span key={site} className="pill" style={{ marginRight: 4 }}>
                    {site}{" "}
                    <button className="icon-btn" aria-label={`Protect ${site} again`} title="Protect it again" onClick={() => setPrivacy({ site, protect: true })}>
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
        <p className="small faint" style={{ margin: "4px 0 6px" }}>
          The browser keeps its own sign-ins, cookies and cache on the desktop, apart from your other browsers. Downloads go to Vault › Downloads.
        </p>
        <button className="btn small" onClick={act(() => engine<{ sites: number }>({ op: "clear-data" }), "Cookies and cache cleared (sites you were signed into have signed you out), with the open sites' stored data.")}>
          Clear cookies and cache
        </button>
      </section>

      {note ? <p className="small">{note}</p> : null}

      <section>
        <EnginePanel embedded onClose={onClose} onRestarted={onRestarted} />
      </section>
    </div>
  );
}
