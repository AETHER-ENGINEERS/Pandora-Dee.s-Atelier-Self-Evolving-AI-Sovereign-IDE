import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Hash, LogOut, MessageSquarePlus, Package, Paperclip, RefreshCw, Send, UserRound, Users } from "lucide-react";
import { desk, useDesk } from "../lib/store.ts";
import { library } from "../lib/xdc.ts";
import { openMenu } from "../ui/ContextMenu.tsx";
import { askUser } from "../ui/Ask.tsx";
import { pickInExplorer, showInExplorer, type PickOptions } from "../lib/explorer.ts";
import qrcode from "qrcode-generator";
import { copyText } from "../lib/clipboard.ts";
import { askText } from "../ui/Ask.tsx";
import { openInFullBrowser } from "./FullBrowser.tsx";

/**
 * Vector for the people using the desktop. First and foremost the real thing: Vector's own app, installed and
 * opened from here (checked against its release's checksum), and on a phone by scanning a code. Then, for those
 * who want it inside the desktop window, a built-in client on Vector's vector-agent (see server/vector.mjs): chats,
 * Communities, files, and Mini Apps opened straight into Games & Apps. The characters' accounts stay on the bridges.
 */

type Attachment = { id: string; key: string; nonce: string; extension: string; name: string; url: string; path: string; size: number; downloaded: boolean; webxdc_topic?: string };
type Msg = { id: string; content: string; at: number; mine: boolean; npub?: string; attachments: Attachment[]; pending?: boolean; failed?: boolean };
type Chat = { id: string; chat_type: string | number; participants: string[]; messages: Msg[]; metadata?: { custom_fields?: Record<string, string> } };
type Community = { community_id: string; name: string; dissolved?: boolean; channels: { channel_id: string; name: string; readable?: boolean }[] };
type Profile = { name?: string; display_name?: string; nickname?: string; avatar?: string };

const KEY = "pdd-vector";
const saved = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null") as { token: string; npub: string } | null;
  } catch {
    return null;
  }
};

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const r = await fetch(`/api/vector/${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { "x-vector-token": token } : {}) }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw Object.assign(new Error(j.error || `Vector answered ${r.status}.`), { status: r.status });
  return j;
}
const call = <T,>(token: string, name: string, args?: unknown) => post<{ result: T }>("call", { name, args }, token).then((r) => r.result);

// ---------- a fresh identity: 32 random bytes as a bech32 "nsec" (what Vector itself makes) ----------
const CHARS = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
function polymod(values: number[]) {
  const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= G[i];
  }
  return chk;
}
function bech32(hrp: string, bytes: Uint8Array) {
  const data: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) data.push((acc >> (bits -= 5)) & 31);
  }
  if (bits) data.push((acc << (5 - bits)) & 31);
  const hrpx = [...hrp].map((c) => c.charCodeAt(0) >> 5).concat([0], [...hrp].map((c) => c.charCodeAt(0) & 31));
  const mod = polymod([...hrpx, ...data, 0, 0, 0, 0, 0, 0]) ^ 1;
  const check = Array.from({ length: 6 }, (_, i) => (mod >> (5 * (5 - i))) & 31);
  return `${hrp}1${[...data, ...check].map((d) => CHARS[d]).join("")}`;
}
export function newNsec() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  b[0] = Math.min(b[0], 0xfe); // stays below the curve's order
  return bech32("nsec", b);
}

const time = (ms: number) => new Date(ms).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" });
const short = (npub: string) => (npub.length > 20 ? `${npub.slice(0, 10)}…${npub.slice(-4)}` : npub);
const isApp = (a: Attachment) => Boolean(a.webxdc_topic) || /^xdc$/i.test(a.extension);
const isPicture = (a: Attachment) => /^(png|jpe?g|gif|webp|avif)$/i.test(a.extension);

const ANDROID = "https://github.com/VectorPrivacy/Vector/releases/latest/download/Vector-arm64-v8a.apk";
const RELEASES = "https://github.com/VectorPrivacy/Vector/releases/latest";
/** Vector 0.5.0's beta on the web; when 0.5.0 is released, "Open Vector here" moves to it. */
const VECTOR_WEB_BETA = "https://web.vectorapp.io";

type AppInfo = { id: string; installed: boolean; version: string; how: string; where: string; job: { state: string; done: number; total: number; error: string } | null };

/** A QR code as an SVG (black on white, so phones read it in any theme). */
function Qr({ text, size = 168 }: { text: string; size?: number }) {
  const svg = useMemo(() => {
    const q = qrcode(0, "M");
    q.addData(text);
    q.make();
    return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }, [text]);
  return <div className="vector-qr" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function VectorApp() {
  const [mode, setMode] = useState(() => localStorage.getItem("pdd-vector-mode") || "home");
  const go = (m: string) => (setMode(m), localStorage.setItem("pdd-vector-mode", m));
  if (mode === "client")
    return (
      <div className="vector-wrap">
        <button className="btn small vector-back" onClick={() => go("home")}>← Vector's app, phones and more</button>
        <BuiltIn />
      </div>
    );
  if (mode === "host") return <VectorHosted onBack={() => go("home")} />;
  return <VectorHome onClient={() => go("client")} onHost={() => go("host")} />;
}

type HostStatus = { built: boolean; build: { version: string; commit: string } | null; running: boolean; connected: boolean; log: string[] };

/** Vector's own interface in this window, on Vector built in host mode (server/vectorHost.mjs). */
function VectorHosted({ onBack }: { onBack: () => void }) {
  const [st, setSt] = useState<HostStatus | null>(null);
  const [error, setError] = useState("");
  const frame = useRef<HTMLIFrameElement>(null);
  // what Vector's page asks of the desktop (vector-host/shim.js): Explorer as its file pickers, the desktop's dialogs,
  // "Reveal in folder", and Mini Apps into Games & Apps
  useEffect(() => {
    const on = async (e: MessageEvent) => {
      const m = e.data as { pddVector?: string; id?: number; [k: string]: unknown };
      if (!m?.pddVector || e.source !== frame.current?.contentWindow || e.origin !== location.origin) return;
      const reply = (value: unknown) => frame.current?.contentWindow?.postMessage({ pddReply: true, id: m.id, value }, location.origin);
      try {
        if (m.pddVector === "pick") return reply(await pickInExplorer({ mode: m.mode as PickOptions["mode"], multiple: Boolean(m.multiple), filters: m.filters as PickOptions["filters"], defaultName: m.defaultName as string, title: m.title as string }));
        if (m.pddVector === "ask") return reply(await askUser(String(m.title || "Vector"), String(m.body || ""), String(m.yes || "OK"), String(m.no ?? "")));
        if (m.pddVector === "reveal" || (m.pddVector === "open" && !/\.xdc$/i.test(String(m.path)))) return reply(void showInExplorer(String(m.path)));
        if (m.pddVector === "miniapp" || m.pddVector === "open") {
          // the same version already there is just opened; a new one is added beside the others, then opened
          const r = await fetch("/api/vector-host/import-xdc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: m.path }) });
          const j = (await r.json()) as { id?: string; error?: string };
          if (!r.ok || !j.id) return reply({ error: j.error || "That Mini App couldn't be opened." });
          const pkg = (await library.list()).find((p) => p.id === j.id);
          if (pkg) {
            desk().set({ game: { kind: "xdc", slug: pkg.appKey, title: pkg.name, players: [], pkgId: pkg.id, scope: pkg.appKey } });
            desk().openApp("games");
          }
          return reply({ ok: true });
        }
      } catch (err) {
        reply({ error: err instanceof Error ? err.message : String(err) });
      }
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, []);
  const load = useCallback(
    () =>
      void fetch("/api/vector-host/status")
        .then((r) => r.json())
        .then(setSt, () => undefined),
    [],
  );
  useEffect(load, [load]);
  // start it when the window opens (once: if it stops, Try again starts it), and look again until its bridge talks
  const [tries, setTries] = useState(0);
  const started = useRef(-1);
  useEffect(() => {
    if (!st?.built || st.running || started.current === tries) return;
    started.current = tries;
    setError("");
    void fetch("/api/vector-host/start", { method: "POST", body: "{}" }).then(async (r) => {
      if (!r.ok) setError(((await r.json().catch(() => ({}))) as { error?: string }).error || `It answered ${r.status}.`);
      load();
    });
  }, [st?.built, st?.running, tries, load]);
  useEffect(() => {
    if (st?.connected) return;
    const t = window.setInterval(load, 1000);
    return () => window.clearInterval(t);
  }, [st?.connected, load]);
  const back = (
    <button className="btn small vector-back" onClick={onBack}>
      ← Vector's app, phones and more
    </button>
  );
  if (!st) return <div className="vector-home muted">…</div>;
  if (!st.built)
    return (
      <div className="vector-home">
        {back}
        <h3>Vector's app isn't built here yet</h3>
        <p className="small muted">
          This shows Vector's own app in the window: the same interface and engine, built from Vector's source in host mode (with its own
          data folder, next to any Vector you already have). Building it takes Rust and, on Windows, Microsoft's C++ build tools:
        </p>
        <pre className="small">node vector-host/build.mjs --vector &lt;a checkout of github.com/VectorPrivacy/Vector&gt; --out &lt;data folder&gt;/vector-host/app</pre>
        <p className="small muted">See the README's Vector section for the options (portable MSVC, where the build goes).</p>
      </div>
    );
  if (!st.connected)
    return (
      <div className="vector-home">
        {back}
        <p className="muted">
          {error ? <span className="danger-text">{error}</span> : st.running ? "Starting Vector…" : "Vector stopped."}
        </p>
        {!st.running && started.current === tries ? (
          <button className="btn" onClick={() => setTries((n) => n + 1)}>
            Try again
          </button>
        ) : null}
        {st.log.length ? <pre className="small faint">{st.log.slice(-8).join("\n")}</pre> : null}
      </div>
    );
  return (
    <div className="vector-wrap">
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        {back}
        <span className="small faint" style={{ marginTop: 6 }}>
          Vector {st.build?.version}
        </span>
      </div>
      <iframe ref={frame} className="vector-frame" src="/vector-app/index.html" title="Vector" allow="clipboard-read; clipboard-write; microphone; camera" />
    </div>
  );
}

function VectorHome({ onClient, onHost }: { onClient: () => void; onHost: () => void }) {
  const [app, setApp] = useState<AppInfo | null>(null);
  const [note, setNote] = useState("");
  const load = useCallback(
    () =>
      void fetch("/api/create/apps")
        .then((r) => r.json())
        .then((l: AppInfo[]) => setApp(l.find((a) => a.id === "vector") ?? null), () => undefined),
    [],
  );
  useEffect(load, [load]);
  // while it downloads, or its installer is open, look again every couple of seconds
  const working = app?.job && !["done", "error"].includes(app.job.state);
  useEffect(() => {
    if (!working && !(app?.job?.state === "installer" && !app.installed)) return;
    const t = window.setInterval(load, working ? 1000 : 4000);
    return () => window.clearInterval(t);
  }, [working, app?.job?.state, app?.installed, load]);
  const post = (path: string) =>
    fetch(`/api/create/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "vector" }) }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as { error?: string }).error || `It answered ${r.status}.`);
      load();
    });
  const j = app?.job;
  return (
    <div className="vector-home">
      <div className="vector-hero">
        <h2>Vector</h2>
        <p className="muted">A private, encrypted messenger. No phone number, no email, no account to create: just a key. Chats, Communities, files and Mini Apps, end-to-end encrypted, with no company in the middle.</p>
        <a className="small" href="https://vectorapp.io" target="_blank" rel="noopener noreferrer">vectorapp.io</a>
      </div>
      <div className="vector-cards">
        <section className="vector-card">
          <h3>On this computer</h3>
          <p className="small muted">Vector's own app, with everything it offers, including signing in from your phone so your key never touches this computer.</p>
          {app?.installed ? (
            <button className="btn primary" onClick={() => void post("open").catch((e) => setNote(String(e.message ?? e)))}>
              Open Vector
            </button>
          ) : (
            <button
              className="btn primary"
              disabled={Boolean(working)}
              onClick={() => {
                setNote("");
                void post("install").catch((e) => setNote(String(e.message ?? e)));
              }}
            >
              Install Vector
            </button>
          )}
          <div className="small faint">
            {j?.state === "downloading"
              ? `Downloading ${Math.round(j.done / 1048576)} of ${Math.round(j.total / 1048576)} MB…`
              : j?.state === "checking"
                ? "Checking it against the release's checksum…"
                : j?.state === "installer" && !app?.installed
                  ? "Vector's installer is open in its own window: finish it there, and this updates."
                  : j?.state === "error"
                    ? <span className="danger-text">{j.error}</span>
                    : app?.installed
                      ? `Installed${app.version ? ` (${app.version})` : ""}.`
                      : "From Vector's releases on GitHub, checked against the release's checksum before it runs."}
          </div>
          {note ? <div className="small danger-text">{note}</div> : null}
        </section>
        <section className="vector-card">
          <h3>On your phone</h3>
          <div className="row" style={{ gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
            <Qr text={ANDROID} />
            <div className="small" style={{ flex: 1, minWidth: 160 }}>
              <p style={{ marginTop: 0 }}>
                <b>Android:</b> scan this with the phone's camera to get the newest Vector app.
              </p>
              <p className="muted">Also on Zapstore, and as an F-Droid build. iPhone: not yet.</p>
              <a href={RELEASES} target="_blank" rel="noopener noreferrer">All downloads</a>
            </div>
          </div>
        </section>
        <section className="vector-card">
          <h3>Inside the desktop</h3>
          <p className="small muted">
            Vector's own app in this window, and on the phones that open the desktop: built from Vector's source with its own data folder, so
            it runs next to any Vector you already have.
          </p>
          <button className="btn primary" onClick={onHost}>
            Open Vector here
          </button>
          {/* Vector 0.5.0's beta on the web, until 0.5.0 is released (Nov 2026) and "Open Vector here" moves to it. Vector's web app
              doesn't allow being shown inside other pages (a deliberate protection for a messenger holding keys), so it opens
              in a window of its own; signing in with the QR code from Vector 0.5.0 on a phone works there. */}
          <p className="small muted">
            <b>Beta 0.5.0:</b> the next Vector, on the web, with sign-in by QR code from Vector 0.5.0 on your phone. It opens in the desktop's
            full browser, which keeps it signed in.
          </p>
          <button className="btn" onClick={() => void openInFullBrowser(VECTOR_WEB_BETA).catch((e: Error) => setNote(e.message))}>
            Beta 0.5.0 <ExternalLink size={13} />
          </button>
          <p className="small muted">
            Or a lighter built-in client: chats, Communities, files, and Mini Apps opened straight into Games & Apps, on Vector's vector-agent.
          </p>
          <button className="btn" onClick={onClient}>
            Use the built-in client
          </button>
        </section>
      </div>
    </div>
  );
}

function BuiltIn() {
  const [sess, setSess] = useState(saved);
  const signOut = () => {
    if (sess) void post("stop", {}, sess.token).catch(() => undefined);
    localStorage.removeItem(KEY);
    setSess(null);
  };
  if (!sess) return <SignIn onIn={(s) => (localStorage.setItem(KEY, JSON.stringify(s)), setSess(s))} />;
  return <Messenger token={sess.token} me={sess.npub} onOut={signOut} />;
}

function SignIn({ onIn }: { onIn: (s: { token: string; npub: string }) => void }) {
  const env = useDesk((s) => s.env);
  const [nsec, setNsec] = useState("");
  const [keep, setKeep] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<{ agent: boolean } | null>(null);
  useEffect(() => void fetch("/api/vector/status").then((r) => r.json()).then(setStatus, () => setStatus({ agent: false })), []);
  const go = async (key: string) => {
    setBusy(true);
    setNote("Signing in… (the first time takes a little while)");
    try {
      const s = await post<{ token: string; npub: string }>("start", { nsec: key });
      if (keep) desk().set({ env: { ...desk().env, VECTOR_NSEC: key } });
      onIn(s);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="vector-signin">
      <h2>Vector</h2>
      <p className="muted small">A private, encrypted messenger: no phone number or email, just a key. Your chats, Communities and Mini Apps, here on the desktop.</p>
      {status && !status.agent ? (
        <div className="note small">
          Vector's engine (vector-agent) isn't on this computer yet. Build it from Vector's repository with <code>cargo build --release -p vector-agent</code>, and put{" "}
          <code>vector-agent</code> in the data folder's <code>vector</code> folder.
        </div>
      ) : null}
      {env.VECTOR_NSEC ? (
        <button className="btn primary" disabled={busy} onClick={() => void go(env.VECTOR_NSEC)}>
          Sign in with the key in Keys
        </button>
      ) : null}
      <label className="mini-field">
        <span>Your secret key (nsec1…)</span>
        <input className="input mono" type="password" value={nsec} onChange={(e) => setNsec(e.target.value.trim())} placeholder="nsec1…" autoComplete="off" spellCheck={false} />
      </label>
      <label className="check small" style={{ padding: 0 }}>
        <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
        <span>Keep it in Keys on this device (VECTOR_NSEC), to sign in with one click</span>
      </label>
      <div className="row" style={{ gap: 6 }}>
        <button className="btn primary" disabled={busy || !nsec} onClick={() => void go(nsec)}>
          Sign in
        </button>
        <button
          className="btn"
          disabled={busy}
          onClick={() => {
            const k = newNsec();
            setNsec(k);
            setNote("A new identity was made. Its secret key is in the box above: keep a copy somewhere safe (it's the only way back into this account), then Sign in.");
          }}
        >
          New to Vector? Make an identity
        </button>
      </div>
      {note ? <p className="small muted">{note}</p> : null}
      <p className="small faint">Your key stays on this computer and its Vector engine; it isn't sent anywhere else, and isn't in backups.</p>
    </div>
  );
}

function Messenger({ token, me, onOut }: { token: string; me: string; onOut: () => void }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [open, setOpen] = useState<{ id: string; kind: "dm" | "channel"; title: string } | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const profiles = useRef(new Map<string, Profile>());
  const [, bump] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);

  const fail = useCallback(
    (e: unknown) => {
      const err = e as Error & { status?: number };
      if (err?.status === 401) return onOut();
      setNote(err instanceof Error ? err.message : String(err));
    },
    [onOut],
  );

  const name = (npub?: string) => {
    if (!npub) return "";
    if (npub === me) return "You";
    const p = profiles.current.get(npub);
    if (!p) {
      profiles.current.set(npub, {});
      void call<Profile>(token, "get_profile", { npub }).then((r) => {
        if (r && typeof r === "object") profiles.current.set(npub, r);
        bump((n) => n + 1);
      }, () => undefined);
    }
    return p?.nickname || p?.display_name || p?.name || short(npub);
  };

  const loadLists = useCallback(() => {
    void call<Chat[]>(token, "list_chats").then((c) => setChats(Array.isArray(c) ? c : []), fail);
    void call<Community[]>(token, "list_communities").then((c) => setCommunities(Array.isArray(c) ? c : []), () => undefined);
  }, [token, fail]);

  const loadMsgs = useCallback(
    (id: string) =>
      void call<Msg[]>(token, "get_messages", { chat_id: id, limit: 100000, offset: 0 }).then((m) => {
        setMsgs(Array.isArray(m) ? m.slice(-150) : []);
        setTimeout(() => log.current && (log.current.scrollTop = log.current.scrollHeight), 0);
      }, fail),
    [token, fail],
  );

  useEffect(() => {
    loadLists();
    void call(token, "sync_dms", { since_days: 30 }).then(loadLists, () => undefined);
  }, [loadLists, token]);

  // new messages: every few seconds; the open chat refreshes when something arrives for it
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    const t = window.setInterval(() => {
      void call<unknown>(token, "get_new_messages").then((r) => {
        if (!Array.isArray(r) || !r.length) return;
        loadLists();
        const o = openRef.current;
        if (o && (r as { chat_id: string }[]).some((m) => m.chat_id === o.id)) loadMsgs(o.id);
      }, fail);
    }, 4000);
    return () => window.clearInterval(t);
  }, [token, loadLists, loadMsgs, fail]);

  const choose = (id: string, kind: "dm" | "channel", title: string) => {
    setOpen({ id, kind, title });
    setMsgs([]);
    loadMsgs(id);
    if (kind === "channel") {
      const c = communities.find((x) => x.channels.some((ch) => ch.channel_id === id));
      if (c) void call(token, "sync_community_channel", { community_id: c.community_id, channel_id: id, limit: 50 }).then(() => loadMsgs(id), () => undefined);
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || !open) return;
    setDraft("");
    try {
      if (open.kind === "dm") await call(token, "send_dm", { to_npub: open.id, content: text });
      else await call(token, "send_community_message", { channel_id: open.id, content: text });
      loadMsgs(open.id);
    } catch (e) {
      setDraft(text);
      fail(e);
    }
  };

  const sendBytes = async (name: string, body: Blob) => {
    if (!open || open.kind !== "dm") return setNote("Files go to direct chats.");
    setNote(`Sending ${name}…`);
    const r = await fetch(`/api/vector/file?to=${encodeURIComponent(open.id)}`, { method: "POST", headers: { "x-vector-token": token, "x-filename": encodeURIComponent(name) }, body });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) return fail(Object.assign(new Error(j.error || `Vector answered ${r.status}.`), { status: r.status }));
    setNote("");
    loadMsgs(open.id);
  };

  const shareApp = async (e: React.MouseEvent) => {
    const pkgs = await library.list().catch(() => []);
    if (!pkgs.length) return setNote("There are no apps in Games & Apps to share yet.");
    openMenu(e, [
      { heading: "Share a Mini App into this chat" },
      ...pkgs.slice(0, 40).map((p) => ({
        label: `${p.name} ${p.version ?? ""}`.trim(),
        run: () => void fetch(library.exportUrl(p.id)).then((r) => r.blob()).then((b) => sendBytes(`${p.name.replace(/[^\w .-]+/g, "_")}.xdc`, b), fail),
      })),
    ]);
  };

  const openApp = async (a: Attachment) => {
    setNote(`Opening ${a.name || "the Mini App"}…`);
    try {
      const r = await post<{ id: string | null; added: number }>("open-app", { attachment: a }, token);
      const pkg = (await library.list()).find((p) => p.id === r.id);
      if (!pkg) return setNote(r.added ? "Added to Games & Apps." : "It's already in Games & Apps.");
      desk().set({ game: { kind: "xdc", slug: pkg.appKey, title: pkg.name, players: [], pkgId: pkg.id, scope: pkg.appKey } });
      desk().openApp("games");
      setNote("");
    } catch (e) {
      fail(e);
    }
  };

  const dms = chats.filter((c) => c.chat_type === "DirectMessage" || c.chat_type === 0);
  const sorted = useMemo(() => [...dms].sort((a, b) => (b.messages.at(-1)?.at ?? 0) - (a.messages.at(-1)?.at ?? 0)), [dms]);

  return (
    <div className="vector">
      <aside className="vector-side">
        <div className="toolbar">
          <b className="grow ellipsis" title={me}>{name(me) === "You" ? short(me) : name(me)}</b>
          <button className="icon-btn" data-tip="Copy your npub (to share with people)" aria-label="Copy your npub" onClick={() => void copyText(me)}>
            <UserRound size={14} />
          </button>
          <button className="icon-btn" data-tip="Check for new messages" aria-label="Refresh" onClick={() => (loadLists(), void call(token, "sync_dms", { since_days: 7 }).then(loadLists, fail))}>
            <RefreshCw size={14} />
          </button>
          <button className="icon-btn" data-tip="Sign out (the account stays on this computer)" aria-label="Sign out" onClick={onOut}>
            <LogOut size={14} />
          </button>
        </div>
        <div className="row" style={{ gap: 4, padding: "4px 6px" }}>
          <button
            className="btn small grow"
            onClick={async () => {
              const npub = (await askText("Who?", "", { body: "Their npub (it starts with npub1).", placeholder: "npub1…" }))?.trim();
              if (npub && /^npub1[0-9a-z]{20,}$/.test(npub)) choose(npub, "dm", name(npub));
              else if (npub) setNote("That isn't an npub (they start with npub1).");
            }}
          >
            <MessageSquarePlus size={13} /> New chat
          </button>
          <button
            className="btn small grow"
            onClick={async () => {
              const url = (await askText("Join a Community", "", { body: "Its invite link.", placeholder: "https://vectorapp.io/invite#…" }))?.trim();
              if (url) void call(token, "join_community", { invite_url: url }).then(loadLists, fail);
            }}
          >
            <Users size={13} /> Join
          </button>
        </div>
        <div className="vector-list">
          {sorted.map((c) => {
            const last = c.messages.at(-1);
            return (
              <button key={c.id} className={`item${open?.id === c.id ? " on" : ""}`} onClick={() => choose(c.id, "dm", name(c.id))}>
                <span className="grow ellipsis">
                  <b>{name(c.id)}</b>
                  <span className="small faint ellipsis" style={{ display: "block" }}>{last ? (last.content || (last.attachments.length ? `📎 ${last.attachments[0].name || "a file"}` : "")) : ""}</span>
                </span>
              </button>
            );
          })}
          {communities.map((c) => (
            <div key={c.community_id} className="vector-community">
              <div className="small muted"><Users size={12} /> {c.name}{c.dissolved ? " (closed)" : ""}</div>
              {c.channels.map((ch) => (
                <button key={ch.channel_id} className={`item${open?.id === ch.channel_id ? " on" : ""}`} disabled={ch.readable === false} onClick={() => choose(ch.channel_id, "channel", `${c.name} · #${ch.name}`)}>
                  <Hash size={12} /> {ch.name}
                </button>
              ))}
            </div>
          ))}
          {!sorted.length && !communities.length ? <div className="empty small faint">No chats yet. Start one with someone's npub, or join a Community.</div> : null}
        </div>
      </aside>
      <section className="vector-main">
        {open ? (
          <>
            <div className="toolbar">
              <b className="grow ellipsis">{open.title}</b>
              {open.kind === "dm" ? <span className="small faint mono" title={open.id}>{short(open.id)}</span> : null}
            </div>
            <div className="vector-log" ref={log}>
              {msgs.map((m) => (
                <div key={m.id} className={`vector-msg${m.mine ? " mine" : ""}${m.failed ? " failed" : ""}`}>
                  <div className="small faint">{m.mine ? "You" : name(m.npub)} · {time(m.at)}{m.pending ? " · sending" : ""}{m.failed ? " · didn't send" : ""}</div>
                  {m.content ? <div className="vector-text">{m.content}</div> : null}
                  {m.attachments.map((a) => (
                    <AttachmentView key={a.id || a.url} a={a} token={token} onOpenApp={() => void openApp(a)} />
                  ))}
                </div>
              ))}
              {!msgs.length ? <div className="empty small faint">No messages here yet.</div> : null}
            </div>
            <div className="composer">
              {open.kind === "dm" ? (
                <>
                  <button className="icon-btn" aria-label="Send a file" data-tip-up="" data-tip="Send a file" onClick={() => fileRef.current?.click()}>
                    <Paperclip size={16} />
                  </button>
                  <button className="icon-btn" aria-label="Share a Mini App" data-tip-up="" data-tip="Share a Mini App from Games & Apps" onClick={(e) => void shareApp(e)}>
                    <Package size={16} />
                  </button>
                  <input ref={fileRef} type="file" hidden onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void sendBytes(f.name, f);
                  }} />
                </>
              ) : null}
              <textarea value={draft} rows={1} onChange={(e) => setDraft(e.target.value)} placeholder={`Message ${open.title}`} aria-label="Message" onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && (e.preventDefault(), void send())} />
              <button className="btn primary" disabled={!draft.trim()} onClick={() => void send()} aria-label="Send">
                <Send size={16} />
              </button>
            </div>
          </>
        ) : (
          <div className="empty">Pick a chat, or start one.</div>
        )}
        {note ? <div className="small muted" style={{ padding: "4px 10px" }}>{note}</div> : null}
      </section>
    </div>
  );
}

function AttachmentView({ a, token, onOpenApp }: { a: Attachment; token: string; onOpenApp: () => void }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (!isPicture(a)) return;
    let url = "";
    fetch("/api/vector/attachment", { method: "POST", headers: { "Content-Type": "application/json", "x-vector-token": token }, body: JSON.stringify({ attachment: a }) })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => b && setSrc((url = URL.createObjectURL(b))))
      .catch(() => undefined);
    return () => void (url && URL.revokeObjectURL(url));
  }, [a.url, a.path]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = () =>
    void fetch("/api/vector/attachment", { method: "POST", headers: { "Content-Type": "application/json", "x-vector-token": token }, body: JSON.stringify({ attachment: a }) })
      .then((r) => r.blob())
      .then((b) => {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(b);
        link.download = a.name || `file.${a.extension}`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 5000);
      });
  if (isApp(a))
    return (
      <div className="vector-file app">
        <Package size={16} /> <span className="grow ellipsis">{a.name || "A Mini App"}</span>
        <button className="btn small primary" onClick={onOpenApp}>Open Mini App</button>
      </div>
    );
  if (src) return <img className="vector-pic" src={src} alt={a.name} onClick={save} title="Click to save" />;
  return (
    <div className="vector-file">
      <Paperclip size={14} /> <span className="grow ellipsis">{a.name || `a .${a.extension} file`}</span>
      <span className="small faint">{a.size ? `${Math.max(1, Math.round(a.size / 1024))} KB` : ""}</span>
      <button className="btn small" onClick={save}>Save</button>
    </div>
  );
}
