import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpenText, ExternalLink, Globe, House, MoreHorizontal, Plus, RotateCw, Star, X } from "lucide-react";
import { desk, useDesk } from "../lib/store.ts";
import { appOrigin } from "../lib/xdc.ts";
import { outbound } from "../lib/outbound.ts";
import { scopeOf } from "../lib/model.ts";
import { pageToMarkdown } from "../lib/jadeCore.ts";
import { renderMarkdown } from "../lib/markdown.ts";
import { openMenu } from "../ui/ContextMenu.tsx";
import type { BrowserPrefs, BrowserTab } from "../lib/browserPrefs.ts";

/**
 * A tabbed browser. Pages come through the desktop (most sites refuse to be framed directly) into a sandboxed
 * frame that can't reach the desktop; Reader shows any page as clean text. Logins don't carry over: “Open in your
 * browser” is there for those.
 */

const prefs = () => desk().browser;
const setPrefs = (p: Partial<BrowserPrefs>) => desk().set({ browser: { ...desk().browser, ...p } });
const newId = () => Math.random().toString(36).slice(2, 9);

/** What was typed: an address, or words to search for. */
export function toUrl(text: string): string {
  const t = text.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(t) && !/\s/.test(t)) return `https://${t}`;
  // your SearXNG, unless it's on this computer (pages here don't open in the Browser)
  const searx = desk().web.searx?.trim().replace(/\/+$/, "");
  return searx && scopeOf(searx) !== "device" ? `${searx}/search?q=${encodeURIComponent(t)}` : `https://html.duckduckgo.com/html/?q=${encodeURIComponent(t)}`;
}

let keyPromise: Promise<string> | null = null;
const browseKey = () => (keyPromise ??= fetch("/api/browse/key").then((r) => r.json()).then((j: { key: string }) => j.key));

/** Open a page in the Browser (from anywhere on the desktop). */
export function browse(url: string, newTab = true) {
  const b = prefs();
  const cur = b.tabs.find((t) => t.id === b.active);
  if (!newTab && cur) {
    const history = [...cur.history.slice(0, cur.at + 1), url];
    setPrefs({ tabs: b.tabs.map((t) => (t.id === cur.id ? { ...t, history, at: history.length - 1, title: "" } : t)) });
  } else {
    const tab: BrowserTab = { id: newId(), history: [url], at: 0, title: "", reader: false };
    setPrefs({ tabs: [...b.tabs, tab], active: tab.id });
  }
  desk().openApp("browser");
}

export function BrowserApp() {
  const b = useDesk((s) => s.browser);
  const [key, setKey] = useState("");
  useEffect(() => void browseKey().then(setKey, () => setKey("")), []);
  // always at least one tab
  useEffect(() => {
    if (!b.tabs.length) {
      const tab: BrowserTab = { id: newId(), history: [b.home], at: 0, title: "", reader: false };
      setPrefs({ tabs: [tab], active: tab.id });
    } else if (!b.tabs.some((t) => t.id === b.active)) setPrefs({ active: b.tabs[0].id });
  }, [b.tabs, b.active, b.home]);
  const tab = b.tabs.find((t) => t.id === b.active) ?? b.tabs[0];

  const editTab = (id: string, p: Partial<BrowserTab>) => setPrefs({ tabs: prefs().tabs.map((t) => (t.id === id ? { ...t, ...p } : t)) });
  const go = (url: string) => {
    if (!tab || !url) return;
    const history = [...tab.history.slice(0, tab.at + 1), url];
    editTab(tab.id, { history, at: history.length - 1, title: "" });
  };
  const close = (id: string) => {
    const tabs = prefs().tabs.filter((t) => t.id !== id);
    const i = prefs().tabs.findIndex((t) => t.id === id);
    setPrefs({ tabs, active: id === prefs().active ? (tabs[Math.max(0, i - 1)]?.id ?? "") : prefs().active });
  };
  const add = (url = prefs().home) => {
    const t: BrowserTab = { id: newId(), history: [url], at: 0, title: "", reader: false };
    setPrefs({ tabs: [...prefs().tabs, t], active: t.id });
  };

  // links and titles from inside the sandboxed page
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const d = e.data as { pddBrowse?: string; url?: string; title?: string };
      if (!d?.pddBrowse || !tab) return;
      if (d.pddBrowse === "title") editTab(tab.id, { title: String(d.title || "").slice(0, 120) });
      else if (d.url && /^https?:/i.test(d.url)) d.pddBrowse === "tab" ? add(d.url) : go(d.url);
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const url = tab?.history[tab.at] ?? "";
  const [typed, setTyped] = useState(url);
  const [nonce, setNonce] = useState(0);
  useEffect(() => setTyped(url), [url, tab?.id]);
  const marked = b.bookmarks.some((m) => m.url === url);
  const title = tab?.title || hostOf(url);
  const src = key && url && !tab?.reader ? `${appOrigin().origin}/browse?k=${key}&u=${b64url(url)}&n=${nonce}` : "";

  const more = (e: React.MouseEvent) =>
    openMenu(e, [
      { label: "Open in your browser", run: () => void window.open(url, "_blank", "noopener") },
      { label: "Copy the address", run: () => void navigator.clipboard?.writeText(url) },
      { label: "Share with the room", run: () => void import("../lib/agent.ts").then((a) => a.say(`${title ? `${title}: ` : ""}${url}`)) },
      { sep: true },
      { label: "Make this the start page", run: () => setPrefs({ home: url }) },
      { label: "Bookmarks bar", checked: b.bar, run: () => setPrefs({ bar: !b.bar }) },
      ...(b.bookmarks.length ? [{ sep: true as const }, { heading: "Bookmarks" }, ...b.bookmarks.map((m) => ({ label: m.title.slice(0, 50), run: () => go(m.url) }))] : []),
    ]);

  if (!tab) return null;
  return (
    <div className="browser">
      <div className="browser-tabs" role="tablist">
        {b.tabs.map((t) => (
          <div key={t.id} role="tab" aria-selected={t.id === tab.id} className={`browser-tab${t.id === tab.id ? " on" : ""}`} onClick={() => setPrefs({ active: t.id })} onAuxClick={(e) => e.button === 1 && close(t.id)} title={t.history[t.at]}>
            <Globe size={12} className="faint" />
            <span className="ellipsis">{t.title || hostOf(t.history[t.at]) || "New tab"}</span>
            <button className="icon-btn" aria-label="Close tab" onClick={(e) => (e.stopPropagation(), close(t.id))}>
              <X size={12} />
            </button>
          </div>
        ))}
        <button className="icon-btn" aria-label="New tab" data-tip="New tab" onClick={() => add()}>
          <Plus size={14} />
        </button>
      </div>
      <form
        className="browser-bar"
        onSubmit={(e) => {
          e.preventDefault();
          const u = toUrl(typed);
          if (u) go(u);
        }}
      >
        <button type="button" className="icon-btn" aria-label="Back" disabled={tab.at <= 0} onClick={() => editTab(tab.id, { at: tab.at - 1, title: "" })}>
          <ArrowLeft size={15} />
        </button>
        <button type="button" className="icon-btn" aria-label="Forward" disabled={tab.at >= tab.history.length - 1} onClick={() => editTab(tab.id, { at: tab.at + 1, title: "" })}>
          <ArrowRight size={15} />
        </button>
        <button type="button" className="icon-btn" aria-label="Reload" onClick={() => setNonce((n) => n + 1)}>
          <RotateCw size={14} />
        </button>
        <button type="button" className="icon-btn" aria-label="Start page" onClick={() => go(b.home)}>
          <House size={14} />
        </button>
        <input className="input grow mono" value={typed} onChange={(e) => setTyped(e.target.value)} onFocus={(e) => e.currentTarget.select()} placeholder="Search, or type an address" aria-label="Address" spellCheck={false} />
        <button type="button" className={`icon-btn${tab.reader ? " on" : ""}`} aria-pressed={tab.reader} data-tip={tab.reader ? "Back to the page" : "Reader: just the text"} aria-label="Reader" onClick={() => editTab(tab.id, { reader: !tab.reader })}>
          <BookOpenText size={15} />
        </button>
        <button
          type="button"
          className={`icon-btn${marked ? " on" : ""}`}
          aria-pressed={marked}
          aria-label={marked ? "Remove the bookmark" : "Bookmark this page"}
          data-tip={marked ? "Remove the bookmark" : "Bookmark"}
          onClick={() => setPrefs({ bookmarks: marked ? b.bookmarks.filter((m) => m.url !== url) : [...b.bookmarks, { title: title || url, url }] })}
        >
          <Star size={15} fill={marked ? "currentColor" : "none"} />
        </button>
        <button type="button" className="icon-btn" aria-label="Open in your browser" data-tip="Open in your browser (for sign-ins)" onClick={() => void window.open(url, "_blank", "noopener")}>
          <ExternalLink size={14} />
        </button>
        <button type="button" className="icon-btn" aria-label="More" onClick={more}>
          <MoreHorizontal size={15} />
        </button>
      </form>
      {b.bar && b.bookmarks.length ? (
        <div className="browser-marks">
          {b.bookmarks.map((m) => (
            <button
              key={m.url}
              className="chip"
              title={m.url}
              onClick={() => go(m.url)}
              onAuxClick={(e) => e.button === 1 && add(m.url)}
              onContextMenu={(e) =>
                openMenu(e, [
                  { label: "Open", run: () => go(m.url) },
                  { label: "Open in a new tab", run: () => add(m.url) },
                  { label: "Rename…", run: () => { const t = prompt("Bookmark name", m.title); if (t) setPrefs({ bookmarks: prefs().bookmarks.map((x) => (x.url === m.url ? { ...x, title: t } : x)) }); } },
                  { label: "Remove", danger: true, run: () => setPrefs({ bookmarks: prefs().bookmarks.filter((x) => x.url !== m.url) }) },
                ])
              }
            >
              {m.title.slice(0, 28)}
            </button>
          ))}
        </div>
      ) : null}
      {tab.reader ? (
        <Reader key={`${url}#${nonce}`} url={url} onTitle={(t) => editTab(tab.id, { title: t })} onGo={go} onTab={add} />
      ) : src ? (
        <iframe
          // a fresh frame for every page (re-pointing a sandboxed frame left it blank in some browsers)
          key={`${tab.id}#${tab.at}#${url}#${nonce}`}
          ref={frame}
          className="browser-frame"
          src={src}
          title={title || "Page"}
          // the desktop sends every page with a sandbox policy (no allow-same-origin): it gets no origin of its own,
          // so it can't reach the desktop or the apps. (Set on the page rather than here, where some browsers block it.)
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="empty small faint">Opening…</div>
      )}
    </div>
  );
}

/** Any page as clean, readable text (Jade's Rust core does the reading). */
function Reader({ url, onTitle, onGo, onTab }: { url: string; onTitle: (t: string) => void; onGo: (u: string) => void; onTab: (u: string) => void }) {
  const [state, setState] = useState<{ html?: string; error?: string }>({});
  useEffect(() => {
    let live = true;
    (async () => {
      const r = await outbound(url, { headers: { Accept: "text/html,*/*" }, timeout: 30 }, desk().net.via);
      if (!r.ok) throw new Error(`The site answered ${r.status}.`);
      const page = await pageToMarkdown(await r.text(), url);
      if (!page?.text) throw new Error("There's no readable text on that page.");
      if (!live) return;
      if (page.title) onTitle(page.title);
      setState({ html: renderMarkdown(`${page.title ? `# ${page.title}\n\n` : ""}${withoutLinkRuns(page.text)}`) });
    })().catch((e) => live && setState({ error: e instanceof Error ? e.message : String(e) }));
    return () => {
      live = false;
    };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps
  const html = useMemo(() => state.html ?? "", [state.html]);
  if (state.error) return <div className="empty small">{state.error}</div>;
  if (!state.html) return <div className="empty small faint">Reading the page…</div>;
  return (
    <div
      className="browser-reader preview"
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest("a");
        if (!a) return;
        const href = a.getAttribute("href") || "";
        let abs = "";
        try {
          abs = new URL(href, url).href;
        } catch {
          return;
        }
        if (!/^https?:/i.test(abs)) return;
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) onTab(abs);
        else onGo(abs);
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Long runs of lines that are nothing but a link (language pickers, site menus) left out, so the reading starts at the text. */
export function withoutLinkRuns(md: string, min = 8): string {
  const lines = md.split("\n");
  const bare = (l: string) => /^\s*(?:[-*+]|\d+\.)?\s*\[[^\]]*\]\([^)]*\)\s*$/.test(l);
  const out: string[] = [];
  for (let i = 0; i < lines.length; ) {
    let j = i;
    while (j < lines.length && (bare(lines[j]) || (!lines[j].trim() && j + 1 < lines.length && bare(lines[j + 1])))) j++;
    if (j - i >= min) i = j;
    else out.push(lines[i++]);
  }
  return out.join("\n");
}

/** The address for /browse, base64url-encoded (some blockers stop requests that carry a raw URL). */
function b64url(s: string) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function hostOf(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}
