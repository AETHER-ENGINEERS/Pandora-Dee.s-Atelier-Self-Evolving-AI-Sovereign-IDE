import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Copy, Download, Plug, PlugZap, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { ViaPicker } from "../ui/Via.tsx";
import { askUser } from "../ui/Ask.tsx";
import { VIA_OPTIONS } from "../lib/outbound.ts";
import { desk, uid, useDesk, type Bridge, type BridgeId, type Exposure, type McpServer, type SshHost } from "../lib/store.ts";
import { allowStdio, connectServer, disconnect, links, stdioStatus, type StdioStatus } from "../lib/connections.ts";
import { startBridge, stopBridge } from "../lib/bridges.ts";
import { allowed, FEATURES, type Feature } from "../lib/privacy.ts";
import { scopeOf, SCOPE_LABEL } from "../lib/model.ts";
import { allMcp, fromMcpJson, toMcpJson } from "../lib/mcptools.ts";
import { openHost, sshOp } from "../lib/ssh.ts";
import { applyInbound } from "../lib/inbound.ts";
import { webSearch } from "../lib/net.ts";
import { download } from "../lib/backup.ts";
import { RiskDialog, Seg, Sensitive, timeOf } from "../ui/common.tsx";
import { Num } from "../ui/Num.tsx";
import { useWidth } from "../ui/hooks.ts";
import { copyText } from "../lib/clipboard.ts";

type Tab = "discord" | "vector" | "inbox" | "mcp" | "web" | "ssh" | "api";

const TABS: { id: Tab; label: string }[] = [
  { id: "discord", label: "Discord" },
  { id: "vector", label: "Vector" },
  { id: "inbox", label: "Inbox" },
  { id: "mcp", label: "Tool servers (MCP)" },
  { id: "web", label: "Web" },
  { id: "ssh", label: "SSH" },
  { id: "api", label: "Inbound API" },
];

function useLinks() {
  return useSyncExternalStore(links.subscribe, links.version, links.version);
}

function StateLine({ k }: { k: string }) {
  useLinks();
  const st = links.state(k);
  if (st.state === "on") return <span className="pill good">Connected{st.detail ? ` as ${st.detail}` : ""} · {st.tools} tools</span>;
  if (st.state === "connecting") return <span className="pill">Connecting…</span>;
  if (st.state === "error") return <span className="pill bad" title={st.error}>Not connected</span>;
  return <span className="pill">Off</span>;
}

function ErrorLine({ k }: { k: string }) {
  useLinks();
  const st = links.state(k);
  return st.state === "error" ? <div className="note bad small" style={{ marginTop: 8 }}>{st.error}</div> : null;
}

/** "This needs permission" with a button that explains the risk. Renders nothing once allowed. */
function Permission({ feature }: { feature: Feature }) {
  const privacy = useDesk((s) => s.privacy);
  const [risk, setRisk] = useState(false);
  if (allowed(privacy, feature)) return null;
  const f = FEATURES.find((x) => x.id === feature)!;
  return (
    <div className="note small" style={{ marginBottom: 12 }}>
      {privacy.mode === "none" ? (
        <>This is off because privacy is set to None (Settings → Privacy).</>
      ) : (
        <>
          {f.label} is off until you allow it.{" "}
          <button className="btn small" onClick={() => setRisk(true)}>
            Read what it shares…
          </button>
        </>
      )}
      {risk ? <RiskDialog feature={feature} onClose={() => setRisk(false)} /> : null}
    </div>
  );
}

function KeyField({ label, name, onName }: { label: string; name: string; onName: (n: string) => void }) {
  const set = useDesk((s) => Boolean(s.env[name]));
  return (
    <label className="field">
      <span>{label}: the name of the key in Keys</span>
      <input className="input mono" value={name} onChange={(e) => onName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))} />
      <span className="small">
        {set ? <span style={{ color: "var(--good)" }}>Set in Keys.</span> : <span style={{ color: "var(--warn)" }}>Not set yet. </span>}
        {!set ? (
          <button className="btn small ghost" onClick={() => desk().openApp("keys")}>
            Open Keys
          </button>
        ) : null}
      </span>
    </label>
  );
}

export function ConnectionsApp() {
  const [tab, setTab] = useState<Tab>(() => (sessionStorage.getItem("pdd-conn-tab") as Tab) || "discord");
  const inbox = useDesk((s) => s.inbox.filter((i) => !i.done).length);
  const [ref, width] = useWidth<HTMLDivElement>();
  useEffect(() => {
    const on = (e: Event) => setTab((e as CustomEvent<Tab>).detail);
    window.addEventListener("pdd-connections", on);
    return () => window.removeEventListener("pdd-connections", on);
  }, []);
  return (
    <div ref={ref} className={`split${width < 600 ? " narrow" : ""}`}>
      <aside className="side settings-nav">
        <div className="list">
          {TABS.map((t) => (
            <button key={t.id} className={`item${tab === t.id ? " on" : ""}`} onClick={() => (setTab(t.id), sessionStorage.setItem("pdd-conn-tab", t.id))}>
              {t.label}
              {t.id === "inbox" && inbox ? <span className="pill warn" style={{ marginLeft: 6 }}>{inbox}</span> : null}
            </button>
          ))}
        </div>
      </aside>
      <section className="section">
        {tab === "discord" || tab === "vector" ? <BridgePanel id={tab} key={tab} /> : null}
        {tab === "inbox" ? <InboxPanel /> : null}
        {tab === "mcp" ? <McpPanel /> : null}
        {tab === "web" ? <WebPanel /> : null}
        {tab === "ssh" ? <SshPanel /> : null}
        {tab === "api" ? <ApiPanel /> : null}
      </section>
    </div>
  );
}

// ---------- Discord and Vector ----------

function BridgePanel({ id }: { id: BridgeId }) {
  const s = useDesk();
  const b = s.bridges[id];
  const name = id === "discord" ? "Discord" : "Vector";
  const patch = (p: Partial<Bridge>) => desk().set({ bridges: { ...desk().bridges, [id]: { ...desk().bridges[id], ...p } } });
  const ok = allowed(s.privacy, "bridges");
  const chars = s.visibleCharacters();
  const idLabel = id === "discord" ? "user id" : "npub";

  const toggle = async () => {
    if (b.enabled) {
      patch({ enabled: false });
      stopBridge(id);
      return;
    }
    patch({ enabled: true });
    await startBridge(id);
  };

  return (
    <>
      <h2>
        {name} <Sensitive />
      </h2>
      <p className="lead small">
        The characters take part in {name} through the {name} bridge, the same bridge Pandora Dee and Jade Vault use. It runs on a computer you keep on; the characters' minds stay here. Discord and Vector can both be on: the characters answer one conversation at a time.
      </p>
      <Permission feature="bridges" />
      <div className="row" style={{ marginBottom: 14 }}>
        <StateLine k={`bridge:${id}`} />
        <span className="grow" />
        <button className={`btn ${b.enabled ? "" : "primary"}`} disabled={!ok && !b.enabled} onClick={() => void toggle()}>
          {b.enabled ? <Plug size={14} /> : <PlugZap size={14} />} {b.enabled ? "Disconnect" : "Connect"}
        </button>
        {b.enabled ? (
          <button className="btn" onClick={() => void startBridge(id)}>
            <RefreshCw size={14} /> Reconnect
          </button>
        ) : null}
      </div>
      <ErrorLine k={`bridge:${id}`} />
      <label className="field">
        <span>Bridge address (printed by the bridge's setup)</span>
        <input className="input mono" value={b.url} onChange={(e) => patch({ url: e.target.value })} />
      </label>
      <KeyField label="Bridge token" name={b.keyName} onName={(keyName) => patch({ keyName })} />
      <label className="field">
        <span>Check for new messages every (seconds)</span>
        <Num min={2} max={120} value={b.pollSeconds} onChange={(pollSeconds) => patch({ pollSeconds })} />
      </label>

      <div className="divider" />
      <h4>People</h4>
      <label className="field">
        <span>Your own {idLabel}: you're their locksmith, holding the keys to every tool</span>
        <input className="input mono" value={b.owner} onChange={(e) => patch({ owner: e.target.value.trim() })} />
      </label>
      <label className="field">
        <span>What the characters call you to others</span>
        <input className="input" value={b.ownerName} placeholder={s.session ?? "your name"} onChange={(e) => patch({ ownerName: e.target.value })} />
      </label>
      <label className="field">
        <span>Admins ({idLabel}s, separated by spaces or commas): {name} powers, never your files or memory</span>
        <input className="input mono" value={b.residents} onChange={(e) => patch({ residents: e.target.value })} />
      </label>
      <p className="small muted">
        Everyone else can chat in their own conversation, react, play Mini Apps and leave you messages. Only you get files, memory, the shell, the web tools and MCP. The characters never see your memory or files when they talk with someone else.
      </p>

      <div className="divider" />
      <h4>When to answer</h4>
      <label className="field">
        <span>Who can message them directly</span>
        <Seg
          value={b.dms}
          options={[
            { id: "anyone", label: "Anyone" },
            { id: "residents", label: "Admins" },
            { id: "owner", label: "Only me" },
            { id: "off", label: "Nobody" },
          ]}
          onChange={(dms) => patch({ dms })}
        />
      </label>
      <label className="field">
        <span>Channels they take part in ({id === "discord" ? "channel ids or #names" : "channel ids"}, separated by spaces or commas)</span>
        <input className="input mono" value={b.channels} onChange={(e) => patch({ channels: e.target.value })} />
      </label>
      <label className="field">
        <span>In those channels, answer when…</span>
        <Seg
          value={b.trigger}
          options={[
            { id: "mention", label: "Mentioned or replied to" },
            { id: "name", label: "Trigger words" },
            { id: "all", label: "Every message" },
          ]}
          onChange={(trigger) => patch({ trigger })}
        />
      </label>
      {b.trigger === "name" ? (
        <label className="field">
          <span>Trigger words, besides the characters' names (comma separated)</span>
          <input className="input" value={b.words} onChange={(e) => patch({ words: e.target.value })} placeholder="e.g. pandora, atelier" />
        </label>
      ) : null}
      <label className="field">
        <span>Answers by default (naming another character works too)</span>
        <select className="select" value={b.answerAs} onChange={(e) => patch({ answerAs: e.target.value })}>
          {chars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={b.images} onChange={(e) => patch({ images: e.target.checked })} />
        <span>Let them see pictures people send (needs a model that understands pictures)</span>
      </label>
      {id === "vector" ? (
        <>
          <label className="check">
            <input type="checkbox" checked={b.xdcWake} onChange={(e) => patch({ xdcWake: e.target.checked })} />
            <span>Wake them when a Mini App they joined gets new moves</span>
          </label>
          <label className="field">
            <span>Accept community invites from</span>
            <Seg
              value={b.autoJoin}
              options={[
                { id: "admins", label: "Me and admins" },
                { id: "anyone", label: "Anyone" },
              ]}
              onChange={(autoJoin) => patch({ autoJoin })}
            />
          </label>
        </>
      ) : (
        <label className="field">
          <span>What you call the server archive (optional; the bridge needs --archive)</span>
          <input className="input" value={b.archiveName} onChange={(e) => patch({ archiveName: e.target.value })} />
        </label>
      )}

      <div className="divider" />
      <h4>Secretary</h4>
      <label className="field">
        <span>Messages for you</span>
        <Seg
          value={b.notify}
          options={[
            { id: "inbox", label: "File them in the Inbox" },
            { id: "now", label: `Inbox, and message me on ${name} at once` },
          ]}
          onChange={(notify) => patch({ notify })}
        />
      </label>
      <label className="check">
        <input type="checkbox" checked={b.inboxUnanswered} onChange={(e) => patch({ inboxUnanswered: e.target.checked })} />
        <span>Also file direct messages they didn't answer (because of who can message them)</span>
      </label>
      <div className="note small" style={{ marginTop: 10 }}>
        Setting up the bridge: unpack <span className="mono">pandora-{id}-2.9.0.tar.gz</span> on the computer that stays on, run <span className="mono">./setup.sh</span>, and copy the Bridge URL and token it prints. If this desktop runs on another machine, use that computer's address instead of localhost.
      </div>
    </>
  );
}

// ---------- Inbox ----------

function InboxPanel() {
  const items = useDesk((s) => s.inbox);
  const [showDone, setShowDone] = useState(false);
  const list = items.filter((i) => showDone || !i.done);
  const set = (id: string, done: boolean) => desk().set({ inbox: desk().inbox.map((i) => (i.id === id ? { ...i, done } : i)) });
  return (
    <>
      <h2>Inbox</h2>
      <p className="lead small">Messages people asked the characters to pass on, and ones they didn't answer. Tick them off when they're handled.</p>
      <div className="row" style={{ marginBottom: 10 }}>
        <label className="check" style={{ padding: 0 }}>
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          <span>Show handled ones</span>
        </label>
        <span className="grow" />
        <button className="btn small" disabled={!items.some((i) => i.done)} onClick={() => desk().set({ inbox: desk().inbox.filter((i) => !i.done) })}>
          Clear handled
        </button>
      </div>
      {list.length === 0 ? <p className="muted">Nothing waiting.</p> : null}
      {list.map((i) => (
        <div key={i.id} className="conn" style={{ opacity: i.done ? 0.55 : 1 }}>
          <label className="check" style={{ padding: 0 }}>
            <input type="checkbox" checked={Boolean(i.done)} onChange={(e) => set(i.id, e.target.checked)} />
            <span>
              <b>
                {i.urgent ? "⚡ " : ""}
                {i.from || "Someone"}
              </b>{" "}
              <span className="small muted">
                on {i.via === "desk" ? "the desktop" : i.via === "vector" ? "Vector" : "Discord"}, {i.where} · {new Date(i.at).toLocaleDateString()} {timeOf(i.at)}
                {i.note ? ` · ${i.note}` : ""}
              </span>
              <br />
              {i.text}
            </span>
          </label>
        </div>
      ))}
    </>
  );
}

// ---------- MCP ----------

const EXPOSURES: { id: Exposure; label: string; detail: string }[] = [
  { id: "codemode", label: "Codemode", detail: "Called from a sandboxed script (saves the most context)" },
  { id: "deferred", label: "Deferred", detail: "Found with tool_search, then loaded" },
  { id: "direct", label: "Direct", detail: "Every tool declared to the model" },
  { id: "hidden", label: "Hidden", detail: "Connected, but not callable" },
];

/** A program server: the locksmith allows it (this exact command, folder and settings), sees what it printed lately. */
function StdioControls({ m }: { m: McpServer }) {
  const [st, setSt] = useState<StdioStatus | null>(null);
  const [problem, setProblem] = useState("");
  const look = () => void stdioStatus(m).then(setSt, (e: Error) => setProblem(e.message));
  useEffect(look, [m.id, JSON.stringify(m.stdio)]); // eslint-disable-line react-hooks/exhaustive-deps
  const env = Object.entries(m.stdio?.env ?? {});
  const act = (allow: boolean) =>
    void allowStdio(m, allow).then(
      () => (setProblem(""), look()),
      (e: Error) => setProblem(e.message),
    );
  return (
    <div className="small" style={{ marginTop: 6 }}>
      {m.stdio?.cwd ? <div className="mono faint">in {m.stdio.cwd}</div> : null}
      {env.length ? <div className="mono faint">with {env.map(([k, v]) => `${k}=${/\$\{/.test(v) ? v : "…"}`).join(" ")}</div> : null}
      <div className="row" style={{ gap: 6, marginTop: 4, flexWrap: "wrap" }}>
        {st?.allowed ? (
          <>
            <span className="muted">Allowed{st.running ? ", running" : st.exited ? `, ${st.exited}` : ""}.</span>
            <button className="btn small" onClick={() => act(false)}>
              Stop allowing
            </button>
          </>
        ) : (
          <>
            <span className="muted">{m.owner ? `${desk().character(m.owner)?.short ?? m.owner} asks` : "It asks"} to run this program on this computer, with the same access you have.</span>
            <button className="btn small primary" onClick={() => act(true)}>
              Allow and start
            </button>
          </>
        )}
        <button className="btn small" onClick={look}>
          Refresh
        </button>
      </div>
      {problem ? <div className="small danger-text">{problem}</div> : null}
      {st?.log.length ? <pre className="mono small faint" style={{ whiteSpace: "pre-wrap", maxHeight: 120, overflow: "auto", margin: "6px 0 0" }}>{st.log.join("\n")}</pre> : null}
    </div>
  );
}

function McpPanel() {
  const s = useDesk();
  useLinks();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [keyName, setKeyName] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const patch = (id: string, p: Partial<McpServer>) => desk().set({ mcp: desk().mcp.map((m) => (m.id === id ? { ...m, ...p } : m)) });
  const add = () => {
    const srv: McpServer = { id: uid(), name: name.trim().replace(/[^A-Za-z0-9_-]/g, "_"), url: url.trim(), keyName: keyName.trim(), enabled: true, exposure: "codemode" };
    desk().set({ mcp: [...desk().mcp, srv] });
    setName("");
    setUrl("");
    setKeyName("");
    void connectServer(srv);
  };
  const tools = allMcp();
  return (
    <>
      <h2>Tool servers (MCP)</h2>
      <p className="lead small">More tools for the characters, from any MCP server that speaks streamable HTTP. Servers on this computer work right away; others need permission. The same mcp.json as Classic can be brought in or saved. A character's own mcp.json (in her files) adds servers only she uses.</p>
      {s.mcp.some((m) => !m.stdio && scopeOf(m.url) !== "device") ? <Permission feature="remote-tools" /> : null}
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn small" onClick={() => fileRef.current?.click()}>
          <Upload size={13} /> Bring in mcp.json
        </button>
        <button className="btn small" disabled={!s.mcp.some((m) => !m.owner)} onClick={() => download("mcp.json", JSON.parse(toMcpJson(s.mcp.filter((m) => !m.owner))))}>
          <Download size={13} /> Save mcp.json
        </button>
      </div>
      {s.mcp.length === 0 ? <p className="muted">No servers yet.</p> : null}
      {s.mcp.map((m) => {
        const mine = tools.filter((t) => t.server.id === m.id);
        return (
          <div key={m.id} className={`conn${m.enabled ? "" : " off"}`}>
            <div className="row">
              <b>{m.name}</b>
              <span className="pill">{m.stdio ? "Program on this computer" : SCOPE_LABEL[scopeOf(m.url)]}</span>
              {m.owner ? (
                <span className="pill" title="From her mcp.json; only she uses it. Edit her file to change it.">
                  {s.character(m.owner)?.name ?? m.owner}'s own
                </span>
              ) : null}
              <StateLine k={`mcp:${m.id}`} />
              <span className="grow" />
              <button
                className="btn small"
                onClick={() => {
                  const enabled = !m.enabled;
                  patch(m.id, { enabled });
                  if (enabled) void connectServer({ ...m, enabled });
                  else disconnect(`mcp:${m.id}`);
                }}
              >
                {m.enabled ? "Turn off" : "Turn on"}
              </button>
              <button className="btn small" onClick={() => void connectServer(desk().mcp.find((x) => x.id === m.id)!)}>
                Reconnect
              </button>
              <button className="btn small" onClick={() => setOpen(open === m.id ? null : m.id)}>
                {open === m.id ? "Less" : "More"}
              </button>
              <button
                className="btn small danger-text"
                aria-label={`Delete ${m.name}`}
                onClick={() =>
                  void askUser(`Delete ${m.name}?`, "The characters lose its tools. You can add it again any time.", "Delete", "Keep").then((ok) => {
                    if (!ok) return;
                    disconnect(`mcp:${m.id}`);
                    desk().set({ mcp: desk().mcp.filter((x) => x.id !== m.id) });
                  })
                }
              >
                <Trash2 size={13} /> Delete…
              </button>
            </div>
            <div className="small mono muted" style={{ marginTop: 4 }}>
              {m.stdio ? [m.stdio.command, ...(m.stdio.args ?? [])].join(" ") : m.url}
            </div>
            <ErrorLine k={`mcp:${m.id}`} />
            {m.stdio ? <StdioControls m={m} /> : null}
            {/* a program on this computer is reached directly, not through a connection method */}
            <div style={{ marginTop: 8, display: m.stdio ? "none" : undefined }}>
              <ViaPicker
                value={m.via}
                inherit={`Same as the default (Connections → Web): ${VIA_OPTIONS.find((o) => o.id === s.net.via)?.label}`}
                onChange={(via) => {
                  patch(m.id, { via });
                  if (m.enabled) void connectServer({ ...m, via });
                }}
                sample={() => ({
                  url: m.url,
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json, text/event-stream",
                    ...(m.keyName && s.env[m.keyName] ? { Authorization: `Bearer ${s.env[m.keyName]}` } : {}),
                    ...Object.fromEntries(Object.entries(m.headers ?? {}).map(([k, v]) => [k, v.replace(/\$\{([A-Za-z0-9_]+)\}/g, (_, n: string) => s.env[n] ?? "")])),
                  },
                  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "pandora-dee-desktop", version: "3" } } }),
                })}
              />
            </div>
            <div className="field" style={{ marginTop: 8, marginBottom: 0 }}>
              <span>How its tools reach the characters</span>
              <select className="select" value={m.exposure ?? "codemode"} onChange={(e) => patch(m.id, { exposure: e.target.value as Exposure })}>
                {EXPOSURES.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}: {x.detail}
                  </option>
                ))}
              </select>
            </div>
            {open === m.id ? (
              <div style={{ marginTop: 10 }}>
                <label className="field">
                  <span>Bearer token: the name of a key in Keys (optional)</span>
                  <input className="input mono" value={m.keyName} onChange={(e) => patch(m.id, { keyName: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })} />
                </label>
                <label className="field">
                  <span>Other headers, one per line as Name: value. Use ${"{KEY_NAME}"} for a key from Keys.</span>
                  <textarea
                    className="textarea mono"
                    rows={3}
                    defaultValue={Object.entries(m.headers ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n")}
                    onBlur={(e) =>
                      patch(m.id, {
                        headers: Object.fromEntries(
                          e.target.value
                            .split("\n")
                            .map((l) => l.split(/:\s*/))
                            .filter((p) => p[0]?.trim() && p.length > 1)
                            .map((p) => [p[0].trim(), p.slice(1).join(":").trim()]),
                        ),
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>Time limit for a call (seconds)</span>
                  <Num min={5} max={600} value={m.timeout ?? 60} onChange={(timeout) => patch(m.id, { timeout })} />
                </label>
                {mine.length ? (
                  <>
                    <h4>Each tool</h4>
                    {mine.map((t) => (
                      <div key={t.name} className="kv" style={{ gridTemplateColumns: "1fr auto" }}>
                        <span className="small">
                          <b className="mono">{t.tool.name}</b> <span className="muted">{(t.tool.description ?? "").slice(0, 100)}</span>
                        </span>
                        <select
                          className="select"
                          style={{ width: "auto" }}
                          value={m.toolExposure?.[t.tool.name] ?? ""}
                          onChange={(e) => {
                            const next = { ...(m.toolExposure ?? {}) };
                            if (e.target.value) next[t.tool.name] = e.target.value as Exposure;
                            else delete next[t.tool.name];
                            patch(m.id, { toolExposure: next });
                          }}
                        >
                          <option value="">As the server ({m.exposure ?? "codemode"})</option>
                          {EXPOSURES.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
      <div className="divider" />
      <h4>Add a server</h4>
      <div className="row">
        <input className="input" style={{ maxWidth: 160 }} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input grow mono" placeholder="http://localhost:3000/mcp" value={url} onChange={(e) => setUrl(e.target.value)} />
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <input className="input grow mono" placeholder="Bearer token's key name in Keys (optional)" value={keyName} onChange={(e) => setKeyName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))} />
        <button className="btn primary" disabled={!name.trim() || !/^https?:\/\//.test(url.trim())} onClick={add}>
          <Plus size={14} /> Add
        </button>
      </div>
      <div className="row small" style={{ marginTop: 8, gap: 6, flexWrap: "wrap" }}>
        <span className="muted">Ready-made:</span>
        {[
          { n: "AICord Docs", u: "https://docs.aicordapp.com/~gitbook/mcp" },
        ].map((x) => (
          <button key={x.u} className="btn small" disabled={s.mcp.some((m) => m.url === x.u)} onClick={() => (setName(x.n), setUrl(x.u))}>
            {x.n}
          </button>
        ))}
      </div>
      <p className="small faint" style={{ marginTop: 8 }}>
        A server that only runs as a command (stdio) can be wrapped for the browser with: npx -y supergateway --stdio "your command" --outputTransport streamableHttp
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            const added = fromMcpJson(await f.text());
            desk().set({ mcp: [...desk().mcp, ...added] });
            for (const srv of added) if (srv.enabled) void connectServer(srv);
            desk().say(`${added.length} server${added.length === 1 ? "" : "s"} brought in. Header values like \${NAME} come from Keys.`);
          } catch {
            desk().say("That isn't a valid mcp.json.");
          }
        }}
      />
    </>
  );
}

// ---------- Web ----------

/** Which Python and cURL the desktop's relay found, and where to point it at another Python. */
function Programs() {
  const s = useDesk();
  const [found, setFound] = useState<{ python: { path: string; version: string } | null; curl: { path: string; version: string } | null } | null>(null);
  const [py, setPy] = useState(s.net.python ?? "");
  const look = async (refresh = false) => {
    setFound(null);
    const q = new URLSearchParams({ ...(refresh ? { refresh: "1" } : {}), ...(desk().net.python ? { python: desk().net.python! } : {}) });
    setFound(await (await fetch(`/api/relay/programs?${q}`)).json());
  };
  useEffect(() => {
    void look();
  }, []);
  return (
    <div className="note small" style={{ marginTop: 10 }}>
      <div>
        <b>Python:</b>{" "}
        {!found ? "looking…" : found.python ? <span style={{ color: "var(--good)" }}>{found.python.version} · <span className="mono">{found.python.path}</span></span> : <span style={{ color: "var(--warn)" }}>not found</span>}
      </div>
      <div>
        <b>cURL:</b>{" "}
        {!found ? "looking…" : found.curl ? <span style={{ color: "var(--good)" }}>{found.curl.version} · <span className="mono">{found.curl.path}</span></span> : <span style={{ color: "var(--warn)" }}>not found</span>}
      </div>
      <label className="field" style={{ marginTop: 8, marginBottom: 0 }}>
        <span>Python program (optional): the python.exe, or the folder it's in. Windows paths (F:\folder) and Git Bash paths (/f/folder) both work.</span>
        <div className="row" style={{ gap: 6 }}>
          <input className="input mono grow" value={py} placeholder="found automatically" onChange={(e) => setPy(e.target.value)} />
          <button
            className="btn small"
            onClick={() => {
              desk().set({ net: { ...desk().net, python: py.trim() || undefined } });
              void look(true);
            }}
          >
            Use and check
          </button>
        </div>
      </label>
    </div>
  );
}

function WebPanel() {
  const s = useDesk();
  const w = s.web;
  const [q, setQ] = useState("pandora dee");
  const [out, setOut] = useState("");
  const set = (p: Partial<typeof w>) => desk().set({ web: { ...desk().web, ...p } });
  return (
    <>
      <h2>Web</h2>
      <p className="lead small">How the characters search and read the web. Searches go to the service you pick; pages are read through a page reader.</p>
      <Permission feature="web" />
      <label className="field">
        <span>Search with</span>
        <select className="select" value={w.search} onChange={(e) => set({ search: e.target.value as typeof w.search })}>
          <option value="auto">Automatic: Ollama web search if you have an Ollama key, then SearXNG, then DuckDuckGo, then Wikipedia</option>
          <option value="ollama">Ollama web search (needs OLLAMA_API_KEY in Keys)</option>
          <option value="searxng">SearXNG (your own instance)</option>
          <option value="ddg">DuckDuckGo instant answers</option>
          <option value="wikipedia">Wikipedia</option>
        </select>
      </label>
      <ViaPicker
        label="How requests leave the desktop (web search, page reading, the characters' http_request, backups, bridges, and tool servers set to follow this)"
        value={s.net.via}
        onChange={(via) => desk().set({ net: { via: via ?? "desktop" } })}
        sample={() => ({ url: `${(w.searx || "http://localhost:8888").replace(/\/+$/, "")}/search?format=json&q=test`, method: "GET", headers: { Accept: "application/json" } })}
      />
      <Programs />
      <label className="field" style={{ marginTop: 12 }}>
        <span>SearXNG address (JSON output is used when it's on in SearXNG's settings.yml; otherwise its results page is read)</span>
        <input className="input mono" value={w.searx} placeholder="http://localhost:8888" onChange={(e) => set({ searx: e.target.value })} />
      </label>
      <h4>Try it</h4>
      <div className="row">
        <input className="input grow" value={q} onChange={(e) => setQ(e.target.value)} />
        <button
          className="btn"
          onClick={async () => {
            setOut("Searching…");
            try {
              setOut(await webSearch(q, 3));
            } catch (e) {
              setOut(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          Search
        </button>
      </div>
      {out ? <pre className="mono small" style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{out}</pre> : null}
    </>
  );
}

// ---------- SSH ----------

function SshPanel() {
  const s = useDesk();
  const [edit, setEdit] = useState<SshHost | null>(null);
  const [sessions, setSessions] = useState<{ session: string; label: string; alive: boolean }[]>([]);
  const [view, setView] = useState("");
  const [screen, setScreen] = useState("");
  const [line, setLine] = useState("");
  const [note, setNote] = useState("");
  const termRef = useRef<HTMLPreElement>(null);

  const refresh = async () => setSessions(((await sshOp("list")) as { sessions?: { session: string; label: string; alive: boolean }[] }).sessions ?? []);
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (!view) return;
    const t = window.setInterval(async () => {
      const r = (await sshOp("screen", { session: view })) as { text?: string; error?: string };
      if (r.error) return setView("");
      setScreen(r.text ?? "");
    }, 700);
    return () => window.clearInterval(t);
  }, [view]);
  useEffect(() => {
    termRef.current?.scrollTo({ top: termRef.current.scrollHeight });
  }, [screen]);

  const save = (h: SshHost) => {
    const list = desk().sshHosts;
    desk().set({ sshHosts: list.some((x) => x.id === h.id) ? list.map((x) => (x.id === h.id ? h : x)) : [...list, h] });
    setEdit(null);
  };

  return (
    <>
      <h2>
        SSH <Sensitive />
      </h2>
      <p className="lead small">Machines the characters (and you) can open terminal sessions on. Passwords and keys stay on this computer; the characters only ever see the names. The first connection to a machine asks you to approve its key.</p>
      <Permission feature="ssh" />
      <label className="check">
        <input type="checkbox" checked={s.sshOn} onChange={(e) => desk().set({ sshOn: e.target.checked })} />
        <span>Let the characters open SSH sessions</span>
      </label>
      <h4 style={{ marginTop: 12 }}>Saved machines</h4>
      {s.sshHosts.length === 0 ? <p className="muted small">None yet.</p> : null}
      {s.sshHosts.map((h) => (
        <div key={h.id} className="kv" style={{ gridTemplateColumns: "1fr auto" }}>
          <span>
            <b>{h.name}</b>{" "}
            <span className="small muted mono">
              {h.user}@{h.host}:{h.port}
            </span>{" "}
            {h.fingerprint ? <span className="pill good">key approved</span> : <span className="pill">key not approved yet</span>} {h.confirm ? <span className="pill">asks before commands</span> : null}
          </span>
          <span className="row" style={{ gap: 4 }}>
            <button
              className="btn small"
              onClick={async () => {
                setNote(`Connecting to ${h.name}…`);
                const r = await openHost(desk().sshHosts.find((x) => x.id === h.id)!, "You");
                if (r.error) setNote(String(r.error));
                else {
                  setNote("");
                  await refresh();
                  setView(String(r.session));
                }
              }}
            >
              Open
            </button>
            <button className="btn small" onClick={() => setEdit(h)}>
              Edit
            </button>
            <button className="icon-btn" aria-label={`Remove ${h.name}`} onClick={() => desk().set({ sshHosts: desk().sshHosts.filter((x) => x.id !== h.id) })}>
              <Trash2 size={14} />
            </button>
          </span>
        </div>
      ))}
      <button className="btn small" style={{ marginTop: 8 }} onClick={() => setEdit({ id: uid(), name: "", host: "", port: 22, user: "", password: "", key: "", fingerprint: "", confirm: true })}>
        <Plus size={13} /> Add a machine
      </button>
      {note ? <div className="note small" style={{ marginTop: 8 }}>{note}</div> : null}

      {edit ? (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="row">
            <label className="field grow">
              <span>Name the characters use</span>
              <input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </label>
            <label className="field grow">
              <span>Address</span>
              <input className="input mono" value={edit.host} onChange={(e) => setEdit({ ...edit, host: e.target.value.trim() })} />
            </label>
            <label className="field" style={{ width: 90 }}>
              <span>Port</span>
              <input className="input" type="number" value={edit.port} onChange={(e) => setEdit({ ...edit, port: Number(e.target.value) || 22 })} />
            </label>
          </div>
          <label className="field">
            <span>User</span>
            <input className="input mono" value={edit.user} onChange={(e) => setEdit({ ...edit, user: e.target.value.trim() })} />
          </label>
          <label className="field">
            <span>Password (leave empty if you use a key)</span>
            <input className="input" type="password" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} />
          </label>
          <label className="field">
            <span>Private key (paste the whole file, OpenSSH or PEM, no passphrase)</span>
            <textarea className="textarea mono" rows={3} value={edit.key} onChange={(e) => setEdit({ ...edit, key: e.target.value })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={edit.confirm} onChange={(e) => setEdit({ ...edit, confirm: e.target.checked })} />
            <span>Ask me before each command the characters run on this machine</span>
          </label>
          {edit.fingerprint ? (
            <p className="small muted">
              Approved key: <span className="mono">{edit.fingerprint}</span>{" "}
              <button className="btn small ghost" onClick={() => setEdit({ ...edit, fingerprint: "" })}>
                Forget it
              </button>
            </p>
          ) : null}
          <div className="row">
            <button className="btn" onClick={() => setEdit(null)}>
              Cancel
            </button>
            <button className="btn primary" disabled={!edit.name.trim() || !edit.host || !edit.user} onClick={() => save(edit)}>
              <Check size={14} /> Save
            </button>
          </div>
        </div>
      ) : null}

      <h4 style={{ marginTop: 16 }}>Open sessions</h4>
      <div className="row">
        {sessions.length === 0 ? <span className="small muted">None.</span> : null}
        {sessions.map((x) => (
          <button key={x.session} className={`btn small${view === x.session ? " primary" : ""}`} onClick={() => setView(x.session)}>
            {x.label} {x.alive ? "" : "(closed)"}
          </button>
        ))}
        <button className="icon-btn" aria-label="Refresh sessions" onClick={() => void refresh()}>
          <RefreshCw size={13} />
        </button>
      </div>
      {view ? (
        <div style={{ marginTop: 8 }}>
          <pre ref={termRef} className="term" style={{ height: 260, margin: 0, borderRadius: 8 }}>
            {screen || "…"}
          </pre>
          <form
            className="row"
            style={{ marginTop: 6 }}
            onSubmit={(e) => {
              e.preventDefault();
              void sshOp("send", { session: view, text: line, enter: true });
              setLine("");
            }}
          >
            <input className="input mono grow" value={line} onChange={(e) => setLine(e.target.value)} placeholder="Type a command and press Enter" />
            <button type="button" className="btn small" onClick={() => void sshOp("send", { session: view, keys: ["ctrl-c"] })}>
              Ctrl+C
            </button>
            <button
              type="button"
              className="btn small danger"
              onClick={async () => {
                await sshOp("close", { session: view });
                setView("");
                await refresh();
              }}
            >
              Close
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}

// ---------- Inbound API ----------

function ApiPanel() {
  const s = useDesk();
  const a = s.api;
  const [status, setStatus] = useState("");
  const [show, setShow] = useState(false);
  const set = (p: Partial<typeof a>) => desk().set({ api: { ...desk().api, ...p } });
  const apply = async () => {
    const r = await applyInbound();
    setStatus(r.listening ? `Listening on ${a.lan ? "your network" : "this computer"}, port ${a.port}.` : r.error ? r.error : "Off.");
  };
  const tok = s.env[a.keyName] ?? "";
  const base = `http://${a.lan ? "<this computer's address>" : "127.0.0.1"}:${a.port}`;
  return (
    <>
      <h2>
        Inbound API <Sensitive />
      </h2>
      <p className="lead small">
        Other programs (scripts, shortcuts, home automation) can talk to the characters, the same way as Pandora Dee and Jade Vault on Android: GET requests to <span className="mono">/v1/chat</span>, <span className="mono">/v1/status</span>, <span className="mono">/v1/history</span>, <span className="mono">/v1/chats</span> and <span className="mono">/v1/health</span>, with a token. The desktop has to be open to answer.
      </p>
      <Permission feature="api" />
      <label className="check">
        <input type="checkbox" checked={a.on} disabled={!allowed(s.privacy, "api") && !a.on} onChange={(e) => set({ on: e.target.checked })} />
        <span>Turn the API on</span>
      </label>
      <label className="field" style={{ maxWidth: 220 }}>
        <span>Port</span>
        <input className="input" type="number" min={1024} max={65535} value={a.port} onChange={(e) => set({ port: Math.min(65535, Math.max(1024, Number(e.target.value) || 15700)) })} />
      </label>
      <label className="check">
        <input type="checkbox" checked={a.lan} onChange={(e) => set({ lan: e.target.checked })} />
        <span>Allow other devices on my Wi-Fi (plain HTTP: only on a network you trust)</span>
      </label>
      <div className="field">
        <span>Token (key {a.keyName} in Keys; made for you when the API turns on)</span>
        <div className="row">
          <input className="input mono grow" readOnly type={show ? "text" : "password"} value={tok} placeholder="made when you turn it on" />
          <button className="btn small" onClick={() => setShow(!show)}>
            {show ? "Hide" : "Show"}
          </button>
          <button className="icon-btn" aria-label="Copy token" disabled={!tok} onClick={() => copyText(tok)}>
            <Copy size={14} />
          </button>
          <button
            className="btn small"
            onClick={() => {
              const fresh = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
              desk().set({ env: { ...desk().env, [a.keyName]: fresh } });
            }}
          >
            New token
          </button>
        </div>
      </div>
      <button className="btn primary" onClick={() => void apply()}>
        Apply
      </button>
      {status ? <div className="note small" style={{ marginTop: 8 }}>{status}</div> : null}
      <h4 style={{ marginTop: 16 }}>Example</h4>
      <pre className="mono small" style={{ whiteSpace: "pre-wrap" }}>{`curl --get -H "Authorization: Bearer $TOKEN" \\
  --data-urlencode 'message=What did we decide yesterday?' \\
  "${base}/v1/chat"`}</pre>
    </>
  );
}
