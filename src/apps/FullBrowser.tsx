import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpenText, Keyboard, Plus, RotateCw, Settings2, Shield, ShieldOff, X } from "lucide-react";
import { openMenuAt } from "../ui/ContextMenu.tsx";
import { askUser } from "../ui/Ask.tsx";
import { desk, useDesk } from "../lib/store.ts";
import { addressFor } from "../lib/browserPrefs.ts";
import { BrowserSettings } from "./BrowserSettings.tsx";
import { LookButton, usePageLook } from "./browserLook.tsx";

/** Open an address in the full browser, in a new tab, and bring the Browser window forward. */
export async function openInFullBrowser(url: string) {
  desk().set({ browser: { ...desk().browser, mode: "full" } });
  desk().openApp("browser");
  await post({ op: "open", url });
}

/** The full browser: a real Chromium-family engine on the computer with the desktop (server/engine.mjs), shown live here
 *  on any device. Clicks, touches, scrolling and typing go to it; it keeps its own sites' logins and caches. */

/** `blocked`, `trackers`, `banner`, `unprotected`: the privacy layer on this page (server/engine.mjs). */
type Tab = { id: string; url: string; title: string; loading: boolean; active: boolean; blocked?: number; trackers?: string[]; banner?: string; unprotected?: boolean };

async function post<T = { ok: boolean }>(body: Record<string, unknown>): Promise<T> {
  const r = await fetch("/api/engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dpr: Math.min(3, window.devicePixelRatio || 1), ...body }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `The desktop answered ${r.status}.`);
  return j as T;
}
// input goes one request after another, so fast typing arrives in order
let line: Promise<unknown> = Promise.resolve();
// a pointer move or scroll still waiting its turn: later ones merge into it (moves: the newest position; scrolls: added
// up), so a slow connection never builds a queue of stale movements. Anything else starts a new one after it.
let waitingMove: Record<string, unknown> | null = null;
let waitingWheel: Record<string, unknown> | null = null;
const quiet = (body: Record<string, unknown>) => {
  waitingMove = waitingWheel = null;
  line = line.then(() => post(body)).catch(() => undefined);
};
const moveTo = (body: Record<string, unknown>) => {
  if (waitingMove) return void Object.assign(waitingMove, body);
  const job = (waitingMove = { ...body });
  line = line.then(() => (waitingMove === job && (waitingMove = null), post(job))).catch(() => undefined);
};
const scrollBy = (body: Record<string, unknown> & { dx: number; dy: number }) => {
  if (waitingWheel) {
    const w = waitingWheel as typeof body;
    return void Object.assign(w, body, { dx: w.dx + body.dx, dy: w.dy + body.dy });
  }
  const job = (waitingWheel = { ...body });
  line = line.then(() => (waitingWheel === job && (waitingWheel = null), post(job))).catch(() => undefined);
};
/** Scroll amounts in pixels, as Chromium counts them: Firefox reports a mouse wheel in lines (3 per notch), which
 *  passed on as pixels scrolled 3 pixels a notch. */
const wheelPx = (e: { deltaX: number; deltaY: number; deltaMode: number }, pageH: number) => {
  const k = e.deltaMode === 1 ? 100 / 3 : e.deltaMode === 2 ? pageH : 1;
  return { dx: e.deltaX * k, dy: e.deltaY * k };
};

// the modifier bits Chromium expects: Alt 1, Ctrl 2, Meta 4, Shift 8
const mods = (e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0);
const BUTTON = ["left", "middle", "right"] as const;

export function FullBrowser({ home, onReader }: { home: string; onReader: () => void }) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [engine, setEngine] = useState("");
  // the page's picture: drawn straight onto a canvas, decoded off the main thread; the window only re-renders when
  // the picture's size changes (once per resize, not 20 times a second)
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [address, setAddress] = useState("");
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  const [engineOpen, setEngineOpen] = useState(false);
  // light or dark pages: this device's setting (followed as it changes) or the one chosen
  const look = usePageLook();
  useEffect(() => {
    if (tabs.length) quiet({ op: "look", ...look });
  }, [look.scheme, look.darken, tabs.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  // sharp, balanced or smooth pictures (one engine for every device: the last one to choose decides)
  const picture = useDesk((s) => s.browser.picture ?? "sharp");
  useEffect(() => {
    if (tabs.length) quiet({ op: "picture", picture });
  }, [picture, tabs.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const view = useRef<HTMLDivElement>(null);
  const typer = useRef<HTMLTextAreaElement>(null);
  const opened = useRef(false);
  const active = tabs.find((t) => t.active);

  // the live stream: tabs and notes by the event stream; pictures as binary by a WebSocket (back to the event stream
  // when the WebSocket can't connect: an older desktop, or a proxy that doesn't pass WebSockets)
  useEffect(() => {
    let closed = false;
    let es: EventSource | null = null;
    // pictures decode one at a time; one that arrives meanwhile waits, replaced by any newer one
    type Pic = { blob: Blob; w: number; h: number };
    let decoding = false;
    let next: Pic | null = null;
    const draw = async (f: Pic) => {
      decoding = true;
      try {
        const bmp = await createImageBitmap(f.blob);
        const c = canvas.current;
        if (c) {
          if (c.width !== bmp.width || c.height !== bmp.height) (c.width = bmp.width), (c.height = bmp.height);
          c.getContext("2d")?.drawImage(bmp, 0, 0);
        }
        bmp.close();
        setFrame((old) => (old && old.w === f.w && old.h === f.h ? old : { w: f.w, h: f.h }));
      } catch {
        /* a damaged picture: the next one replaces it */
      } finally {
        decoding = false;
        const n = next;
        next = null;
        if (n) void draw(n);
      }
    };
    const show = (f: Pic) => {
      if (decoding) next = f;
      else void draw(f);
    };

    const listen = (pictures: boolean) => {
      es?.close();
      es = new EventSource(`/api/engine/stream${pictures ? "" : "?frames=0"}`);
      es.addEventListener("tabs", (e) => {
        const d = JSON.parse((e as MessageEvent).data) as { tabs: Tab[]; engine: string };
        setTabs(d.tabs);
        if (d.engine) setEngine(d.engine);
        // nothing open yet: start with the start page
        if (!d.tabs.length && !opened.current) {
          opened.current = true;
          // where it was left off (the engine reopens those tabs), or the start page
          void post({ op: "open", url: home, start: true, reopen: desk().browser.reopen !== false }).catch((err: Error) => setProblem(err.message));
        }
      });
      if (pictures)
        es.addEventListener("frame", (e) => {
          const f = JSON.parse((e as MessageEvent).data) as { data: string; w: number; h: number };
          const bin = atob(f.data);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          show({ blob: new Blob([bytes], { type: "image/jpeg" }), w: f.w, h: f.h });
        });
      es.addEventListener("note", (e) => setNote((JSON.parse((e as MessageEvent).data) as { text: string }).text));
    };

    listen(false);
    let ws: WebSocket | null = null;
    let worked = false;
    const fallBack = () => !closed && !worked && listen(true);
    try {
      ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/engine/ws`);
      ws.binaryType = "arraybuffer";
      ws.onopen = () => (worked = true);
      ws.onmessage = (e) => {
        const buf = e.data as ArrayBuffer;
        const n = new DataView(buf).getUint32(0);
        const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n))) as { w: number; h: number };
        show({ blob: new Blob([new Uint8Array(buf, 4 + n)], { type: "image/jpeg" }), w: head.w, h: head.h });
      };
      ws.onclose = () => {
        if (closed) return;
        // it worked and then dropped (the desktop restarted): pictures by the event stream from now on
        if (worked) (worked = false), listen(true);
        else fallBack();
      };
    } catch {
      fallBack();
    }
    return () => {
      closed = true;
      es?.close();
      ws?.close();
    };
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
    if (p) moveTo(p);
  };
  const id = active?.id;
  const siteOf = (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  };
  /** The shield's menu: what was stopped here, protection on or off for this site, forget this site. */
  const shieldMenu = (t: Tab) => {
    const site = siteOf(t.url);
    return [
      { heading: t.unprotected ? `Protection is off for ${site}` : `${t.blocked ?? 0} tracker${t.blocked === 1 ? "" : "s"} blocked on this page` },
      ...(t.trackers ?? []).slice(0, 8).map((d) => ({ label: d, disabled: true, run: () => {} })),
      ...(t.banner ? [{ heading: `Cookie banner: said no (${t.banner})` }] : []),
      { sep: true as const },
      t.unprotected
        ? { label: `Protect ${site} again`, run: () => void post({ op: "privacy", site, protect: true }).then(() => quiet({ op: "reload", id: t.id })) }
        : { label: `Turn protection off for ${site} (if it broke)`, run: () => void post({ op: "privacy", site, protect: false }).then(() => quiet({ op: "reload", id: t.id })) },
      {
        label: `Forget ${site}…`,
        danger: true,
        run: () =>
          void askUser(`Forget ${site}?`, `Its cookies and everything it stored in this browser are removed: you'll be signed out of it, and its settings there forgotten. The page then loads again.`, "Forget it", "Keep it").then(
            (yes) => void (yes && post<{ site?: string }>({ op: "forget-site", id: t.id }).then((r) => setNote(`${r.site ?? site} forgotten.`))),
          ),
      },
    ];
  };

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
            const to = addressFor(address, desk().browser.search, desk().web.searx);
            if (id) quiet({ op: "go", id, url: to });
            else quiet({ op: "open", url: to });
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
        {active && /^https?:/.test(active.url) ? (
          <button
            className={`icon-btn shield-btn${active.unprotected ? " off" : ""}`}
            aria-label={active.unprotected ? "Protection is off for this site" : `Privacy: ${active.blocked ?? 0} trackers blocked`}
            data-tip={active.unprotected ? "Protection is off for this site" : `${active.blocked ?? 0} trackers blocked${active.banner ? " · cookie banner: said no" : ""}`}
            onClick={(e) => openMenuAt(e.currentTarget, shieldMenu(active))}
          >
            {active.unprotected ? <ShieldOff size={15} /> : <Shield size={15} />}
            {!active.unprotected && active.blocked ? <span className="shield-count">{active.blocked > 99 ? "99+" : active.blocked}</span> : null}
          </button>
        ) : null}
        <LookButton />
        <button className="icon-btn" aria-label="Browser settings" data-tip="Browser settings: start, search, colours, privacy, engine" onClick={() => setEngineOpen(!engineOpen)}>
          <Settings2 size={15} />
        </button>
      </div>
      {engineOpen ? (
        <BrowserSettings
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
        className={`full-browser-view${look.scheme === "dark" ? " dark" : ""}`}
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
        onWheel={(e) => scrollBy({ op: "wheel", id, ...at(e), ...wheelPx(e, view.current?.clientHeight || 600), mods: mods(e) })}
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
        {/* shown at the page's own size, never stretched: while the window is being resized it's cut off for a moment rather than blurred */}
        <canvas ref={canvas} className="full-browser-canvas" role="img" aria-label={active?.title || "The page"} hidden={!frame} style={frame?.w && frame.h ? { width: frame.w, height: frame.h } : undefined} />
        {frame ? null : <div className="muted small" style={{ padding: 16 }}>{engine ? `Starting ${engine}…` : "Starting the browser…"}</div>}
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
