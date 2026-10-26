import { useEffect, useState } from "react";
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
      <div className={`classic-switch${open ? " open" : ""}`} onPointerEnter={() => setOpen(true)} onPointerLeave={() => setOpen(false)}>
        <button className="classic-handle" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Classic options" data-tip="Classic options">
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
