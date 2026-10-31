import { useEffect, useRef, useState } from "react";
import { ChevronLeft, MonitorPlay } from "lucide-react";
import { desk, useDesk, type ClassicApp } from "../lib/store.ts";
import { outbound } from "../lib/outbound.ts";

type Build = { version: string; file: string };

/** Classic pages call this (their fetch is hooked as the desktop serves them) to send outside requests. */
async function classicFetch(url: string, input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  // (the page's objects come from its own window, so instanceof can't be trusted: check their tags)
  const tag = (x: unknown) => Object.prototype.toString.call(x);
  const req = tag(input) === "[object Request]" ? (input as Request) : null;
  const method = (init.method ?? req?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {};
  new Headers(req?.headers).forEach((v, k) => (headers[k] = v));
  new Headers(init.headers).forEach((v, k) => (headers[k] = v));
  let body: string | Uint8Array | undefined;
  const raw: unknown = init.body ?? (req && method !== "GET" && method !== "HEAD" ? await req.clone().arrayBuffer() : undefined);
  if (typeof raw === "string") body = raw;
  else if (tag(raw) === "[object URLSearchParams]") {
    body = String(raw);
    headers["content-type"] ??= "application/x-www-form-urlencoded;charset=UTF-8";
  } else if (tag(raw) === "[object ArrayBuffer]") body = new Uint8Array(raw as ArrayBuffer);
  else if (ArrayBuffer.isView(raw)) body = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  else if (tag(raw) === "[object Blob]" || tag(raw) === "[object File]") {
    const blob = raw as Blob;
    body = new Uint8Array(await blob.arrayBuffer());
    if (blob.type) headers["content-type"] ??= blob.type;
  } else if (raw != null) return fetch(input, init); // FormData and streams go the browser's way
  return outbound(url, { method, headers, body, signal: init.signal ?? req?.signal ?? undefined }, desk().classicVia);
}
(window as unknown as { __pddRelay: unknown }).__pddRelay = { via: () => desk().classicVia, fetch: classicFetch };
type Index = Record<ClassicApp, Build[]>;

const LABEL: Record<ClassicApp, string> = { pandora: "Pandora Dee", jade: "Jade Vault" };

/** The original apps, full screen, with a small corner switcher that stays out of their way. */
export function Classic() {
  const app = useDesk((s) => s.classicApp);
  const versions = useDesk((s) => s.classicVersion);
  const [index, setIndex] = useState<Index | null>(null);
  const [open, setOpen] = useState(false);
  // how far up the right edge the switcher sits (dragged out of the page's way; kept per browser)
  const [lift, setLift] = useState(() => {
    try {
      return Number(localStorage.getItem("pdd-classic-lift")) || 0;
    } catch {
      return 0;
    }
  });
  const dragged = useRef(false);
  const fit = (n: number) => Math.max(0, Math.min(n, window.innerHeight - 60));
  // Hold and slide the round button up or down; a tap without sliding opens or closes the options.
  const slide = (e: React.PointerEvent) => {
    const startY = e.clientY;
    const from = lift;
    dragged.current = false;
    const move = (ev: PointerEvent) => {
      if (!dragged.current && Math.abs(ev.clientY - startY) < 8) return;
      dragged.current = true;
      setLift(fit(from + startY - ev.clientY));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (!dragged.current) return;
      try {
        localStorage.setItem("pdd-classic-lift", String(fit(from + startY - ev.clientY)));
      } catch {
        /* not kept in a private window: fine */
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  useEffect(() => {
    fetch("/classic/index.json")
      .then((r) => r.json())
      .then(setIndex)
      .catch(() => setIndex({ pandora: [], jade: [] }));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        desk().set({ classic: false });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!index) return <div className="classic" />;
  const builds = index[app];
  const build = builds.find((b) => b.version === versions[app]) ?? builds[0];
  const pick = (next: ClassicApp) => desk().set({ classicApp: next });

  return (
    <div className="classic">
      {build ? (
        <iframe key={build.file} src={`/classic/${build.file}`} title={`${LABEL[app]} ${build.version}`} allow="microphone; camera; clipboard-read; clipboard-write; fullscreen; autoplay" />
      ) : (
        <div className="empty">No {LABEL[app]} build is installed.</div>
      )}
      <div
        className={`classic-switch${open ? " open" : ""}`}
        style={{ bottom: 10 + fit(lift) }}
        // a mouse opens it by pointing at it; on touch screens a tap opens and closes it (pointing doesn't exist there)
        onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)}
        onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(false)}
      >
        <button
          className="classic-handle"
          onPointerDown={slide}
          onClick={() => (dragged.current ? (dragged.current = false) : setOpen(!open))}
          aria-expanded={open}
          aria-label="Classic options"
          data-tip="Classic options (slide it up or down to move it)"
        >
          <MonitorPlay size={16} />
        </button>
        {open ? (
          <div className="classic-panel" role="group" aria-label="Classic options">
            <div className="seg" role="radiogroup" aria-label="Which app">
              {(["pandora", "jade"] as ClassicApp[]).map((id) => (
                <button key={id} role="radio" aria-checked={app === id} className={app === id ? "on" : ""} onClick={() => pick(id)} disabled={!index[id].length}>
                  {LABEL[id]}
                </button>
              ))}
            </div>
            <select
              className="select"
              value={build?.version ?? ""}
              onChange={(e) => desk().set({ classicVersion: { ...versions, [app]: e.target.value } })}
              aria-label="Version"
            >
              {builds.map((b, i) => (
                <option key={b.version} value={b.version}>
                  {b.version}
                  {i === 0 ? " (latest)" : ""}
                </option>
              ))}
            </select>
            <button className="btn small" onClick={() => desk().set({ classic: false })} title="Ctrl+Shift+K">
              <ChevronLeft size={14} /> Desktop
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
