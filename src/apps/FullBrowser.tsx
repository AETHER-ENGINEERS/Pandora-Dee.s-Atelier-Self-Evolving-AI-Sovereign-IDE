import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpenText, Cpu, Keyboard, Plus, RotateCw, X } from "lucide-react";
import { desk } from "../lib/store.ts";
import { EnginePanel } from "./BrowserEngine.tsx";

/** Open an address in the full browser, in a new tab, and bring the Browser window forward. */
export async function openInFullBrowser(url: string) {
  desk().set({ browser: { ...desk().browser, mode: "full" } });
  desk().openApp("browser");
  await post({ op: "open", url });
}

/** The full browser: a real Chromium-family engine on the computer with the desktop (server/engine.mjs), shown live here
 *  on any device. Clicks, touches, scrolling and typing go to it; it keeps its own sites' logins and caches. */

type Tab = { id: string; url: string; title: string; loading: boolean; active: boolean };

async function post<T = { ok: boolean }>(body: Record<string, unknown>): Promise<T> {
  const r = await fetch("/api/engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `The desktop answered ${r.status}.`);
  return j as T;
}
// input goes one request after another, so fast typing arrives in order
let line: Promise<unknown> = Promise.resolve();
const quiet = (body: Record<string, unknown>) => {
  line = line.then(() => post(body)).catch(() => undefined);
};

// the modifier bits Chromium expects: Alt 1, Ctrl 2, Meta 4, Shift 8
const mods = (e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0);
const BUTTON = ["left", "middle", "right"] as const;

export function FullBrowser({ home, onReader }: { home: string; onReader: () => void }) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [engine, setEngine] = useState("");
  const [frame, setFrame] = useState<{ data: string; w: number; h: number } | null>(null);
  const [address, setAddress] = useState("");
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  const [engineOpen, setEngineOpen] = useState(false);
  const view = useRef<HTMLDivElement>(null);
  const typer = useRef<HTMLTextAreaElement>(null);
  const opened = useRef(false);
  const active = tabs.find((t) => t.active);

  // the live stream: tabs, pictures, notes
  useEffect(() => {
    const es = new EventSource("/api/engine/stream");
    es.addEventListener("tabs", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { tabs: Tab[]; engine: string };
      setTabs(d.tabs);
      if (d.engine) setEngine(d.engine);
      // nothing open yet: start with the start page
      if (!d.tabs.length && !opened.current) {
        opened.current = true;
        void post({ op: "open", url: home }).catch((err: Error) => setProblem(err.message));
      }
    });
    es.addEventListener("frame", (e) => setFrame(JSON.parse((e as MessageEvent).data) as { data: string; w: number; h: number }));
    es.addEventListener("note", (e) => setNote((JSON.parse((e as MessageEvent).data) as { text: string }).text));
    return () => es.close();
  }, [home]);

  useEffect(() => {
    if (!editing) setAddress(active?.url && active.url !== "about:blank" ? active.url : "");
  }, [active?.url, editing]);

  // the engine draws at this window's size (and the device's sharpness); phones get the mobile version of sites
  useEffect(() => {
    const el = view.current;
    if (!el) return;
    let timer = 0;
    const tell = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const r = el.getBoundingClientRect();
        if (r.width < 50 || r.height < 50) return;
        // whole pixels, and the screen's real sharpness (up to 3×), so the picture maps 1:1 onto the screen
        quiet({ op: "view", w: Math.floor(r.width), h: Math.floor(r.height), dpr: Math.min(3, window.devicePixelRatio || 1), mobile: r.width < 600 && matchMedia("(pointer: coarse)").matches });
      }, 200);
    };
    const ro = new ResizeObserver(tell);
    ro.observe(el);
    tell();
    return () => (ro.disconnect(), window.clearTimeout(timer));
  }, []);

  const at = (e: { clientX: number; clientY: number }) => {
    const r = view.current!.getBoundingClientRect();
    return { x: Math.round(e.clientX - r.left), y: Math.round(e.clientY - r.top) };
  };
  // pointer moves at most once a frame
  const pending = useRef<Record<string, unknown> | null>(null);
  const flush = () => {
    const p = pending.current;
    pending.current = null;
    if (p) quiet(p);
  };
  const id = active?.id;

  if (problem && !tabs.length)
    return (
      <div className="browser full-browser">
        <div className="note small" style={{ margin: 16 }}>
          {problem} The private Reader still works: <button className="btn small" onClick={onReader}>Use Reader</button>
        </div>
      </div>
    );

  return (
    <div className="browser full-browser">
      <div className="browser-tabs" role="tablist">
        {tabs.map((t) => (
          <div key={t.id} role="tab" aria-selected={t.active} className={`browser-tab${t.active ? " on" : ""}`} onClick={() => quiet({ op: "focus", id: t.id })} onAuxClick={(e) => e.button === 1 && quiet({ op: "close", id: t.id })} title={t.url}>
            <span className="grow" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {t.loading ? "Loading… " : ""}
              {t.title || t.url.replace(/^https?:\/\//, "") || "New tab"}
            </span>
            <button className="icon-btn" aria-label="Close tab" onClick={(e) => (e.stopPropagation(), quiet({ op: "close", id: t.id }))}>
              <X size={12} />
            </button>
          </div>
        ))}
        <button className="icon-btn" aria-label="New tab" data-tip="New tab" onClick={() => quiet({ op: "open", url: home })}>
          <Plus size={14} />
        </button>
      </div>
      <div className="browser-bar">
        <button className="icon-btn" aria-label="Back" onClick={() => quiet({ op: "back", id })}>
          <ArrowLeft size={15} />
        </button>
        <button className="icon-btn" aria-label="Forward" onClick={() => quiet({ op: "forward", id })}>
          <ArrowRight size={15} />
        </button>
        <button className="icon-btn" aria-label="Reload" onClick={() => quiet({ op: "reload", id })}>
          <RotateCw size={14} />
        </button>
        <form
          className="grow"
          onSubmit={(e) => {
            e.preventDefault();
            setEditing(false);
            (document.activeElement as HTMLElement | null)?.blur();
            if (id) quiet({ op: "go", id, url: address });
            else quiet({ op: "open", url: address });
          }}
        >
          <input className="input" value={address} placeholder="Search, or type an address" aria-label="Address" onFocus={(e) => (setEditing(true), e.target.select())} onBlur={() => setEditing(false)} onChange={(e) => setAddress(e.target.value)} />
        </form>
        <button className="icon-btn" aria-label="Keyboard" data-tip="Type into the page (phones: opens the keyboard)" onClick={() => typer.current?.focus()}>
          <Keyboard size={15} />
        </button>
        <button className="icon-btn" aria-label="Reader" data-tip="Reader: the private browser (nothing kept)" onClick={onReader}>
          <BookOpenText size={15} />
        </button>
        <button className="icon-btn" aria-label="Engine" data-tip="The browser's engine (Ungoogled Chromium…)" onClick={() => setEngineOpen(!engineOpen)}>
          <Cpu size={15} />
        </button>
      </div>
      {engineOpen ? (
        <EnginePanel
          onClose={() => setEngineOpen(false)}
          onRestarted={(urls) => {
            // the engine started over: bring back what was open (or the start page)
            setFrame(null);
            setProblem("");
            opened.current = true;
            const list = urls.length ? urls : [home];
            void list.reduce((p, url) => p.then(() => post({ op: "open", url }).then(() => undefined)), Promise.resolve()).catch((err: Error) => setProblem(err.message));
          }}
        />
      ) : null}
      <div
        ref={view}
        className="full-browser-view"
        tabIndex={0}
        onPointerDown={(e) => {
          // typing goes through the hidden box (it takes every kind of typing: keys, dictation, emoji, other
          // languages); on touch screens a tap doesn't pop the keyboard up, the ⌨ button does
          if (e.pointerType === "mouse") typer.current?.focus({ preventScroll: true });
          else view.current?.focus({ preventScroll: true });
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          quiet({ op: "mouse", id, type: "down", ...at(e), button: BUTTON[e.button] ?? "left", buttons: e.buttons, count: e.detail || 1, mods: mods(e) });
        }}
        onPointerUp={(e) => quiet({ op: "mouse", id, type: "up", ...at(e), button: BUTTON[e.button] ?? "left", buttons: e.buttons, count: e.detail || 1, mods: mods(e) })}
        onPointerMove={(e) => {
          if (!pending.current) requestAnimationFrame(flush);
          pending.current = { op: "mouse", id, type: "move", ...at(e), button: e.buttons & 1 ? "left" : "none", buttons: e.buttons, mods: mods(e) };
        }}
        onWheel={(e) => quiet({ op: "wheel", id, ...at(e), dx: e.deltaX, dy: e.deltaY, mods: mods(e) })}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.target !== view.current) return;
          e.preventDefault();
          const text = e.key.length === 1 && !e.ctrlKey && !e.metaKey ? e.key : e.key === "Enter" ? "\r" : "";
          quiet({ op: "key", id, type: "down", key: e.key, code: e.code, keyCode: e.keyCode, text, mods: mods(e) });
        }}
        onKeyUp={(e) => e.target === view.current && quiet({ op: "key", id, type: "up", key: e.key, code: e.code, keyCode: e.keyCode, mods: mods(e) })}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          if (text) (e.preventDefault(), quiet({ op: "text", id, text }));
        }}
      >
        {frame ? (
          <img
            src={`data:image/jpeg;base64,${frame.data}`}
            alt={active?.title || "The page"}
            draggable={false}
            // shown at the page's own size, never stretched: while the window is being resized it's cut off for a moment rather than blurred
            style={frame.w && frame.h ? { width: frame.w, height: frame.h } : undefined}
          />
        ) : <div className="muted small" style={{ padding: 16 }}>{engine ? `Starting ${engine}…` : "Starting the browser…"}</div>}
        {/* phones: a box the on-screen keyboard types into, passed on to the page */}
        <textarea
          ref={typer}
          className="full-browser-typer"
          aria-label="Type into the page"
          onInput={(e) => {
            // a word still being composed (other languages, some phone keyboards) goes when it's finished
            if ((e.nativeEvent as InputEvent).isComposing) return;
            const v = (e.target as HTMLTextAreaElement).value;
            (e.target as HTMLTextAreaElement).value = "";
            if (v) quiet({ op: "text", id, text: v });
          }}
          onCompositionEnd={(e) => {
            const v = (e.target as HTMLTextAreaElement).value || e.data;
            (e.target as HTMLTextAreaElement).value = "";
            if (v) quiet({ op: "text", id, text: v });
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (text) (e.preventDefault(), quiet({ op: "text", id, text }));
          }}
          onKeyDown={(e) => {
            // keys that aren't text (Enter, Backspace, arrows, Tab…) and shortcuts (Ctrl/⌘+A, C, Z…) go as keys
            const special = ["Enter", "Backspace", "Tab", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Escape", "Delete", "Home", "End", "PageUp", "PageDown"].includes(e.key);
            const shortcut = (e.ctrlKey || e.metaKey) && e.key.length === 1 && e.key.toLowerCase() !== "v";
            if (!special && !shortcut) return;
            e.preventDefault();
            quiet({ op: "key", id, type: "down", key: e.key, code: e.code, keyCode: e.keyCode, text: e.key === "Enter" ? "\r" : "", mods: mods(e) });
            quiet({ op: "key", id, type: "up", key: e.key, code: e.code, keyCode: e.keyCode, mods: mods(e) });
          }}
        />
      </div>
      {note ? (
        <div className="browser-note small" onClick={() => setNote("")}>
          {note}
        </div>
      ) : null}
      <div className="faint small" style={{ padding: "2px 8px" }}>
        {engine ? `${engine}, with its own profile on the desktop: sites you sign into stay signed in here.` : ""}
      </div>
    </div>
  );
}
