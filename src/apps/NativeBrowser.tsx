import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpenText, Plus, RotateCw, Volume2, X } from "lucide-react";
import { useDesk } from "../lib/store.ts";

/** The app's real browser (shell/main.mjs): Chromium's own web views, placed over this window's page area. Only in
 *  the PDA SEASIDE app; a plain browser tab gets the streamed full browser instead. */

type Tab = { id: string; url: string; title: string; loading: boolean; active: boolean; canBack: boolean; canForward: boolean; audible: boolean };
type Bridge = {
  call: <T = { ok: boolean }>(req: Record<string, unknown>) => Promise<T>;
  onTabs: (cb: (tabs: Tab[]) => void) => () => void;
  onNote: (cb: (text: string) => void) => () => void;
};

declare global {
  interface Window {
    seasideApp?: { version: number; browser: Bridge };
  }
}

export const appBrowser = (): Bridge | null => window.seasideApp?.browser ?? null;

/** Something of the desktop that has to show above the page: a dialog, a menu, a pop-over. */
const COVERS = ".scrim, .menu, [role='menu'], [role='dialog']:not(.win):not(.native-browser *)";

/** The start page is opened once, however many times the window is drawn (React draws it twice while developing). */
let starting: Promise<unknown> | null = null;

export function NativeBrowser({ home, onReader }: { home: string; onReader: () => void }) {
  const b = appBrowser()!;
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [address, setAddress] = useState("");
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [still, setStill] = useState("");
  const [shown, setShown] = useState(false);
  const view = useRef<HTMLDivElement>(null);
  const active = tabs.find((t) => t.active);
  const front = useDesk((s) => s.wins.browser.z === s.zTop && !s.wins.browser.min && s.wins.browser.open);
  const hangout = useDesk((s) => s.hangout);

  useEffect(() => {
    const offTabs = b.onTabs(setTabs);
    const offNote = b.onNote(setNote);
    starting ??= b.call<Tab[]>({ op: "tabs" }).then((list) => (list.length ? list : b.call({ op: "open", url: home }).then(() => b.call<Tab[]>({ op: "tabs" }))));
    void starting.then((list) => setTabs(list as Tab[]));
    return () => {
      offTabs();
      offNote();
      void b.call({ op: "layout", visible: false });
    };
  }, [b, home]);

  useEffect(() => {
    if (!editing) setAddress(active?.url && active.url !== "about:blank" ? active.url : "");
  }, [active?.url, editing]);

  // follow the page area wherever the window goes (moved, resized, maximized), and step aside for anything of
  // the desktop that has to be on top: the page is a real view laid over the desktop, so it can't be layered under
  useEffect(() => {
    let last = "";
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const el = view.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // only the part inside the app's window, and clear of the dock
      let top = Math.max(0, r.top), left = Math.max(0, r.left), right = Math.min(innerWidth, r.right), bottom = Math.min(innerHeight, r.bottom);
      const dock = document.querySelector(".dock")?.getBoundingClientRect();
      if (dock && dock.height && dock.top < bottom && dock.bottom > top && dock.left < right && dock.right > left) {
        if (dock.top > top + (bottom - top) / 2) bottom = dock.top;
        else top = Math.max(top, dock.bottom);
      }
      const covered = Boolean(document.querySelector(COVERS)) || !front || hangout;
      const visible = !covered && right - left > 20 && bottom - top > 20;
      const key = `${visible}|${Math.round(left)}|${Math.round(top)}|${Math.round(right)}|${Math.round(bottom)}`;
      if (key === last) return;
      last = key;
      setShown(visible);
      void b.call({ op: "layout", x: left, y: top, w: right - left, h: bottom - top, visible });
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [b, front, hangout]);

  // a still of the page, so the window isn't empty while something covers it (taken while it shows, kept fresh)
  useEffect(() => {
    if (!shown || !active) return;
    const take = () => void b.call<{ data: string }>({ op: "snapshot", id: active.id }).then((r) => r.data && setStill(r.data), () => undefined);
    const t = setInterval(take, 2500);
    const first = setTimeout(take, 600);
    return () => (clearInterval(t), clearTimeout(first));
  }, [b, shown, active?.id, active?.url]); // eslint-disable-line react-hooks/exhaustive-deps

  const id = active?.id;
  const call = (req: Record<string, unknown>) => void b.call(req).catch((e: Error) => setNote(e.message));

  return (
    <div className="browser full-browser native-browser">
      <div className="browser-tabs" role="tablist">
        {tabs.map((t) => (
          <div key={t.id} role="tab" aria-selected={t.active} className={`browser-tab${t.active ? " on" : ""}`} onClick={() => call({ op: "focus", id: t.id })} onAuxClick={(e) => e.button === 1 && call({ op: "close", id: t.id })} title={t.url}>
            {t.audible ? <Volume2 size={12} aria-label="Playing sound" /> : null}
            <span className="grow" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {t.loading && !t.title ? "Loading… " : ""}
              {t.title || t.url.replace(/^https?:\/\//, "") || "New tab"}
            </span>
            <button className="icon-btn" aria-label="Close tab" onClick={(e) => (e.stopPropagation(), call({ op: "close", id: t.id }))}>
              <X size={12} />
            </button>
          </div>
        ))}
        <button className="icon-btn" aria-label="New tab" data-tip="New tab" onClick={() => call({ op: "open", url: home })}>
          <Plus size={14} />
        </button>
      </div>
      <div className="browser-bar">
        <button className="icon-btn" aria-label="Back" disabled={!active?.canBack} onClick={() => call({ op: "back", id })}>
          <ArrowLeft size={15} />
        </button>
        <button className="icon-btn" aria-label="Forward" disabled={!active?.canForward} onClick={() => call({ op: "forward", id })}>
          <ArrowRight size={15} />
        </button>
        <button className="icon-btn" aria-label={active?.loading ? "Stop" : "Reload"} onClick={() => call({ op: active?.loading ? "stop" : "reload", id })}>
          {active?.loading ? <X size={14} /> : <RotateCw size={14} />}
        </button>
        <form
          className="grow"
          onSubmit={(e) => {
            e.preventDefault();
            setEditing(false);
            (document.activeElement as HTMLElement | null)?.blur();
            call(id ? { op: "go", id, url: address } : { op: "open", url: address });
          }}
        >
          <input className="input" value={address} placeholder="Search, or type an address" aria-label="Address" onFocus={(e) => (setEditing(true), e.target.select())} onBlur={() => setEditing(false)} onChange={(e) => setAddress(e.target.value)} />
        </form>
        <button className="icon-btn" aria-label="Reader" data-tip="Reader: the private browser (nothing kept)" onClick={onReader}>
          <BookOpenText size={15} />
        </button>
      </div>
      <div ref={view} className="full-browser-view native-browser-view">
        {/* the real page is laid over this area by the app; this still shows only while something covers it */}
        {!shown && still ? <img src={still} alt={active?.title || "The page"} draggable={false} /> : null}
        {!tabs.length ? <div className="muted small" style={{ padding: 16 }}>Opening…</div> : null}
      </div>
      {note ? (
        <div className="browser-note small" onClick={() => setNote("")}>
          {note}
        </div>
      ) : null}
      <div className="faint small" style={{ padding: "2px 8px" }}>
        The app's own browser: real pages, sound and video, with their own sign-ins (kept apart from the desktop).
      </div>
    </div>
  );
}
