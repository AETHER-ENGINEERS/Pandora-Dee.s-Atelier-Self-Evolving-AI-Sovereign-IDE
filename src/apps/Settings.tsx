import { Num } from "../ui/Num.tsx";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Plus, RefreshCw, Trash2 } from "lucide-react";
import { desk, uid, useDesk, type Account } from "../lib/store.ts";
import { listModels, explainError, pickModel, PRESETS, sampleRequest, scopeOf, SCOPE_LABEL, type Connection } from "../lib/model.ts";
import { ViaPicker } from "../ui/Via.tsx";
import { askUser } from "../ui/Ask.tsx";
import { allowed, FEATURES, MODES, type Feature, type Mode } from "../lib/privacy.ts";
import { canSeal, matches, seal, shrinkPicture } from "../lib/secure.ts";
import { speak, voiceList } from "../lib/voice.ts";
import type { Role } from "../lib/flood.ts";
import { Confirm, PersonAvatar, RiskDialog, Seg, Sensitive } from "../ui/common.tsx";
import { useWidth } from "../ui/hooks.ts";
import { download } from "../lib/backup.ts";
import { ACTIONS, bindingOf, comboOf, showCombo } from "../ui/shortcuts.ts";
import { APPS, DOCK_DEFAULT, HANG_DEFAULT, type AppId, type ClassicApp, type DockPrefs } from "../lib/store.ts";
import { library } from "../lib/xdc.ts";
import { backupNow, listBackups, restore, testServer, type RemoteBackup } from "../lib/serverBackup.ts";
import { ICONS } from "../ui/Desktop.tsx";
import { exportJsonl, type Filter, type Format } from "../lib/trajectories.ts";
import { ROUTER_AT } from "../lib/skills.ts";
import type { ChatPrefs, NotesPrefs } from "../lib/store.ts";
import { formatDate } from "../lib/templates.ts";
import { CLOCK_DEFAULT, formatClock, REGIONS, validLocale, validZone, zones, type ClockPrefs } from "../lib/clock.ts";

type Section = "ai" | "chat" | "notes" | "look" | "clock" | "dock" | "hangout" | "voice" | "shortcuts" | "touch" | "classic" | "privacy" | "accounts" | "adult" | "storage" | "backup";

const SECTIONS: { id: Section; label: string; sensitive?: boolean }[] = [
  { id: "ai", label: "AI" },
  { id: "chat", label: "Conversations" },
  { id: "notes", label: "Notes" },
  { id: "look", label: "Look" },
  { id: "clock", label: "Clock" },
  { id: "dock", label: "Dock" },
  { id: "hangout", label: "Hangout" },
  { id: "voice", label: "Voice" },
  { id: "shortcuts", label: "Keyboard" },
  { id: "touch", label: "Touch" },
  { id: "classic", label: "Classic" },
  { id: "privacy", label: "Privacy", sensitive: true },
  { id: "accounts", label: "Accounts" },
  { id: "adult", label: "Adult shelf", sensitive: true },
  { id: "storage", label: "Storage" },
  { id: "backup", label: "Backup and reset" },
];

export function SettingsApp() {
  const [section, setSection] = useState<Section>(() => (sessionStorage.getItem("pdd-settings-section") as Section) || "ai");
  const [ref, width] = useWidth<HTMLDivElement>();
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<string | undefined>).detail;
      if (d && SECTIONS.some((x) => x.id === d)) setSection(d as Section);
    };
    window.addEventListener("pdd-settings", on);
    return () => window.removeEventListener("pdd-settings", on);
  }, []);
  return (
    <div ref={ref} className={`split${width < 600 ? " narrow" : ""}`}>
      <aside className="side settings-nav">
        <div className="list">
          {SECTIONS.map((x) => (
            <button key={x.id} className={`item${section === x.id ? " on" : ""}`} onClick={() => (setSection(x.id), sessionStorage.setItem("pdd-settings-section", x.id))}>
              {x.label}
            </button>
          ))}
        </div>
      </aside>
      <section className="section">
        {section === "ai" ? <AiSection /> : null}
        {section === "chat" ? <ConversationSection /> : null}
        {section === "notes" ? <NotesSection /> : null}
        {section === "look" ? <LookSection /> : null}
        {section === "clock" ? <ClockSection /> : null}
        {section === "dock" ? <DockSection /> : null}
        {section === "hangout" ? <HangoutSection /> : null}
        {section === "voice" ? <VoiceSection /> : null}
        {section === "shortcuts" ? <ShortcutsSection /> : null}
        {section === "touch" ? <TouchSection /> : null}
        {section === "classic" ? <ClassicSection /> : null}
        {section === "storage" ? <StorageSection /> : null}
        {section === "privacy" ? <PrivacySection /> : null}
        {section === "accounts" ? <AccountsSection /> : null}
        {section === "adult" ? <AdultSection /> : null}
        {section === "backup" ? <BackupSection /> : null}
      </section>
    </div>
  );
}

function featureFor(c: Connection): Feature | null {
  const scope = scopeOf(c.baseUrl);
  return scope === "device" ? null : scope === "network" ? "network-models" : "online-models";
}

function AiSection() {
  const s = useDesk();
  const m = s.model;
  const [models, setModels] = useState<Record<string, string[]>>({});
  const [status, setStatus] = useState<Record<string, string>>({});
  const [risk, setRisk] = useState<Feature | null>(null);
  const [preset, setPreset] = useState(0);

  const patchConn = (id: string, p: Partial<Connection>) =>
    desk().set({ model: { ...desk().model, connections: desk().model.connections.map((c) => (c.id === id ? { ...c, ...p } : c)) } });

  const test = async (c: Connection) => {
    const f = featureFor(c);
    if (f && !allowed(desk().privacy, f)) {
      setStatus((x) => ({ ...x, [c.id]: `Blocked by privacy. ${desk().privacy.mode === "none" ? "Privacy is set to None." : "Turn it on below."}` }));
      return;
    }
    setStatus((x) => ({ ...x, [c.id]: "Checking…" }));
    try {
      const list = await listModels(c, c.keyName ? desk().env[c.keyName] ?? "" : "");
      setModels((x) => ({ ...x, [c.id]: list }));
      if (!c.model && list.length) patchConn(c.id, { model: pickModel(list) });
      setStatus((x) => ({ ...x, [c.id]: list.length ? `Connected · ${list.length} model${list.length === 1 ? "" : "s"}` : "Connected, but it has no models yet." }));
    } catch (e) {
      setStatus((x) => ({ ...x, [c.id]: explainError(e, c) }));
    }
  };

  useEffect(() => {
    for (const c of desk().model.connections) if (c.enabled && scopeOf(c.baseUrl) === "device") void test(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const move = (id: string, d: -1 | 1) => {
    const order = [...m.order.filter((x) => m.connections.some((c) => c.id === x)), ...m.connections.map((c) => c.id).filter((x) => !m.order.includes(x))];
    const i = order.indexOf(id);
    const j = i + d;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    desk().set({ model: { ...desk().model, order } });
  };
  const ordered = [...m.connections].sort((a, b) => {
    const ia = m.order.indexOf(a.id);
    const ib = m.order.indexOf(b.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  const add = () => {
    const p = PRESETS[preset];
    const c: Connection = { ...p, id: uid(), model: "", enabled: true };
    desk().set({ model: { ...desk().model, connections: [...m.connections, c], order: [...m.order, c.id] } });
    if (p.keyName && desk().env[p.keyName] === undefined) desk().set({ env: { ...desk().env, [p.keyName]: "" } });
  };

  return (
    <>
      <h2>AI</h2>
      <p className="lead small">
        Where the characters' thinking happens. Everything the original Pandora Dee could reach works here: Ollama on this computer or on Ollama Cloud, Groq, llama.cpp, LM Studio, OpenRouter, any OpenAI-compatible server, and AICord characters. They're tried in order, so if the first can't be reached the next one answers. Each character can also use their own (Characters → profile).
      </p>
      {ordered.map((c, i) => {
        const scope = scopeOf(c.baseUrl);
        const f = featureFor(c);
        const blocked = f && !allowed(s.privacy, f);
        return (
          <div key={c.id} className={`conn${c.enabled ? "" : " off"}`}>
            <div className="row">
              <span className="faint small">{i + 1}.</span>
              <input className="input" style={{ maxWidth: 240, fontWeight: 600 }} value={c.label} onChange={(e) => patchConn(c.id, { label: e.target.value })} aria-label="Connection name" />
              <span className={`pill ${scope === "device" ? "good" : "warn"}`}>{SCOPE_LABEL[scope]}</span>
              {f ? <Sensitive /> : null}
              <span className="grow" />
              <button className="icon-btn" aria-label="Try earlier" disabled={i === 0} onClick={() => move(c.id, -1)}>
                <ArrowUp size={14} />
              </button>
              <button className="icon-btn" aria-label="Try later" disabled={i === ordered.length - 1} onClick={() => move(c.id, 1)}>
                <ArrowDown size={14} />
              </button>
              <label className="check" style={{ padding: 0 }}>
                <input type="checkbox" checked={c.enabled} onChange={(e) => patchConn(c.id, { enabled: e.target.checked })} />
                <span className="small">On</span>
              </label>
              <button
                className="btn small danger-text"
                aria-label={`Delete ${c.label}`}
                onClick={() =>
                  void askUser(`Delete ${c.label}?`, "Characters that used it fall back to your other connections.", "Delete", "Keep").then(
                    (ok) => ok && desk().set({ model: { ...desk().model, connections: desk().model.connections.filter((x) => x.id !== c.id), order: desk().model.order.filter((x) => x !== c.id) } }),
                  )
                }
              >
                <Trash2 size={13} /> Delete…
              </button>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <select className="select" style={{ width: 160 }} value={c.kind} onChange={(e) => patchConn(c.id, { kind: e.target.value as Connection["kind"] })} aria-label="Kind">
                <option value="ollama">Ollama</option>
                <option value="openai">OpenAI-compatible</option>
                <option value="aicord">AICord</option>
              </select>
              <input className="input mono grow" value={c.baseUrl} onChange={(e) => patchConn(c.id, { baseUrl: e.target.value })} aria-label="Address" />
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <span className="small muted">Key</span>
              <input
                className="input mono"
                style={{ maxWidth: 220 }}
                placeholder="none needed"
                value={c.keyName}
                onChange={(e) => patchConn(c.id, { keyName: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })}
                aria-label="Key name"
              />
              {c.keyName ? (
                s.env[c.keyName] ? (
                  <span className="small" style={{ color: "var(--good)" }}>set in Keys</span>
                ) : (
                  <button className="btn small" onClick={() => desk().openApp("keys")}>
                    Set it in Keys
                  </button>
                )
              ) : null}
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <span className="small muted">{c.kind === "aicord" ? "Character" : "Model"}</span>
              {models[c.id]?.length ? (
                <select className="select grow" value={c.model} onChange={(e) => patchConn(c.id, { model: e.target.value })}>
                  {!models[c.id].includes(c.model) ? <option value={c.model}>{c.model || "Pick one"}</option> : null}
                  {models[c.id].map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              ) : (
                <input className="input mono grow" value={c.model} placeholder="Press Check to list models, or type a name" onChange={(e) => patchConn(c.id, { model: e.target.value })} />
              )}
              <button className="btn small" onClick={() => void test(c)}>
                <RefreshCw size={13} /> Check
              </button>
            </div>
            <div style={{ marginTop: 8 }}>
              <ViaPicker value={c.via} onChange={(via) => patchConn(c.id, { via })} sample={() => sampleRequest(c, c.keyName ? desk().env[c.keyName] ?? "" : "")} />
            </div>
            {status[c.id] ? <div className="small" style={{ marginTop: 6, color: /^Connected/.test(status[c.id]) ? "var(--good)" : "var(--muted)" }}>{status[c.id]}</div> : null}
            {blocked ? (
              <div className="note warn small" style={{ marginTop: 8 }}>
                {scope === "cloud" ? "This is an online service." : "This is another machine on your network."} It won't be used until you allow it.{" "}
                <button className="btn small" onClick={() => (s.privacy.mode === "none" ? desk().say("Privacy is set to None. Switch it to Some or Conditional in Privacy first.") : setRisk(f))}>
                  Read what it shares…
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
      <div className="row" style={{ marginTop: 6 }}>
        <select className="select" style={{ maxWidth: 280 }} value={preset} onChange={(e) => setPreset(Number(e.target.value))} aria-label="Kind of connection">
          {PRESETS.map((p, i) => (
            <option key={p.label} value={i}>
              {p.label}
            </option>
          ))}
        </select>
        <button className="btn" onClick={add}>
          <Plus size={14} /> Add connection
        </button>
      </div>
      <div className="divider" />
      <h4>How they think</h4>
      <label className="check">
        <input type="checkbox" checked={m.tools} onChange={(e) => desk().set({ model: { ...desk().model, tools: e.target.checked } })} />
        <span>
          Let characters use tools: their own files, memory and journal, the game screen, Discord and Vector when connected, MCP tool servers, and the web when Privacy allows it. Models without tool support simply talk.
        </span>
      </label>
      <label className="field" style={{ maxWidth: 360 }}>
        <span>Most tool steps in one reply (type a bigger number than the slider goes for long-context models)</span>
        <Num min={1} max={100} typedMax={100000} value={m.maxSteps} onChange={(n) => desk().set({ model: { ...desk().model, maxSteps: n } })} />
      </label>
      <label className="field" style={{ maxWidth: 360 }}>
        <span>Creativity (temperature)</span>
        <Num min={0} max={1.5} step={0.05} value={m.temperature} onChange={(n) => desk().set({ model: { ...desk().model, temperature: n } })} />
      </label>
      <div className="note small">
        Using Ollama on this computer? Install it from ollama.com, then pull a model, for example <span className="mono">ollama pull qwen3:8b</span>. Models with tool support (qwen3, llama3.1+, gpt-oss, mistral) can use files and memory.
      </div>
      {risk ? <RiskDialog feature={risk} onClose={() => setRisk(null)} /> : null}
    </>
  );
}

function LookSection() {
  const s = useDesk();
  return (
    <>
      <h2>Look</h2>
      <label className="field" style={{ maxWidth: 380 }}>
        <span>Text size (px)</span>
        <Num min={12} max={22} value={s.fontSize} onChange={(n) => desk().set({ fontSize: n })} />
      </label>
      <label className="field" style={{ maxWidth: 380 }}>
        <span>Everything bigger or smaller</span>
        <Num min={0.75} max={1.5} step={0.05} value={s.uiScale} onChange={(n) => desk().set({ uiScale: n })} percent />
      </label>
      <label className="check">
        <input type="checkbox" checked={s.wallpaper} onChange={(e) => desk().set({ wallpaper: e.target.checked })} />
        <span>Wallpaper: the scene chosen in Settings → Hangout (whoever is in focus, unless you pick one)</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={s.menuBar} onChange={(e) => desk().set({ menuBar: e.target.checked })} />
        <span>Menu bar (File, Edit, View, Window, Help) on wide screens</span>
      </label>
      {s.menuBar ? (
        <div className="row" style={{ gap: 10, margin: "2px 0 8px 26px", flexWrap: "wrap", alignItems: "center" }}>
          <Seg value={s.bar.edge} onChange={(edge) => desk().set({ bar: { ...desk().bar, edge } })} options={[{ id: "top", label: "Top" }, { id: "bottom", label: "Bottom" }]} />
          <label className="check" style={{ padding: 0 }}>
            <input type="checkbox" checked={s.bar.autoHide} onChange={(e) => desk().set({ bar: { ...desk().bar, autoHide: e.target.checked } })} />
            <span>Hide until the pointer reaches its edge</span>
          </label>
        </div>
      ) : null}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" onClick={() => desk().arrange("tile")}>
          Tile windows
        </button>
        <button className="btn" onClick={() => desk().resetLayout()}>
          Reset window layout
        </button>
      </div>
      <p className="small faint" style={{ marginTop: 12 }}>
        Window sizes and positions are remembered on this device. The colour follows whoever is in focus.
      </p>
    </>
  );
}

function VoiceSection() {
  const s = useDesk();
  const v = s.voice;
  const [voices, setVoices] = useState(voiceList());
  useEffect(() => {
    const on = () => setVoices(voiceList());
    window.speechSynthesis?.addEventListener?.("voiceschanged", on);
    return () => window.speechSynthesis?.removeEventListener?.("voiceschanged", on);
  }, []);
  const set = (p: Partial<typeof v>) => desk().set({ voice: { ...desk().voice, ...p } });
  const focus = s.character(s.focus);
  return (
    <>
      <h2>Voice</h2>
      <p className="lead small">Replies are read aloud with this computer's own voices, and the faces in Presence move their lips along. Nothing is downloaded or sent anywhere to speak. Each character speaks at a slightly different pitch, and each can have their own voice, speed and pitch in Characters → their profile.</p>
      <label className="check">
        <input type="checkbox" checked={v.on} onChange={(e) => set({ on: e.target.checked })} />
        <span>Read replies aloud</span>
      </label>
      <label className="field">
        <span>Voice</span>
        <select className="select" value={v.voiceName} onChange={(e) => set({ voiceName: e.target.value })}>
          <option value="">Automatic (prefers a British English voice)</option>
          {voices.map((x) => (
            <option key={`${x.name}-${x.lang}`} value={x.name}>
              {x.name} · {x.lang}
            </option>
          ))}
        </select>
        {!voices.length ? <span className="small">This browser has no voices; the faces still move.</span> : null}
      </label>
      <label className="field" style={{ maxWidth: 380 }}>
        <span>Voice volume</span>
        <Num min={0} max={1} step={0.05} value={v.volume} onChange={(n) => set({ volume: n })} percent />
      </label>
      <label className="field" style={{ maxWidth: 380 }}>
        <span>Game and app volume</span>
        <Num min={0} max={1} step={0.05} value={v.appVolume} onChange={(n) => set({ appVolume: n })} percent />
      </label>
      <label className="field" style={{ maxWidth: 380 }}>
        <span>Speed</span>
        <Num min={0.6} max={1.6} step={0.05} value={v.rate} onChange={(n) => set({ rate: n })} />
      </label>
      <label className="field" style={{ maxWidth: 380 }}>
        <span>Pitch</span>
        <Num min={0.5} max={1.6} step={0.05} value={v.pitch} onChange={(n) => set({ pitch: n })} />
      </label>
      <button className="btn" onClick={() => focus && speak(focus.id, focus.greeting, { ...v, on: true }, focus.pitch)}>
        Hear {focus?.short ?? "a sample"}
      </button>
    </>
  );
}

function PrivacySection() {
  const s = useDesk();
  const p = s.privacy;
  const [risk, setRisk] = useState<Feature | null>(null);
  const [anon, setAnon] = useState("");
  const set = (patch: Partial<typeof p>) => desk().set({ privacy: { ...desk().privacy, ...patch } });
  const keyholder = s.role() === "keyholder";
  return (
    <>
      <h2>
        Privacy <Sensitive />
      </h2>
      <p className="lead small">Everything that could leave this computer starts off. Each feature asks you to read what it shares before it can be turned on. The bar at the top always shows “Local only” or that something is going out.</p>
      {!keyholder ? <div className="note warn small">Only the keyholder can change privacy.</div> : null}
      <fieldset disabled={!keyholder} style={{ border: 0, padding: 0, margin: 0 }}>
        <h4>What may leave this computer</h4>
        <div style={{ display: "grid", gap: 6, marginBottom: 14 }}>
          {MODES.map((mo) => (
            <label key={mo.id} className="check">
              <input type="radio" name="privacy-mode" checked={p.mode === mo.id} onChange={() => set({ mode: mo.id as Mode })} />
              <span>
                <b>{mo.label}</b> <span className="muted">· {mo.detail}</span>
              </span>
            </label>
          ))}
        </div>
        {p.mode === "conditional" ? (
          <div className="row" style={{ marginBottom: 14 }}>
            <span className="small">Allowed between</span>
            <input className="input" type="time" style={{ width: 130 }} value={p.hours.from} onChange={(e) => set({ hours: { ...p.hours, from: e.target.value } })} />
            <span className="small">and</span>
            <input className="input" type="time" style={{ width: 130 }} value={p.hours.to} onChange={(e) => set({ hours: { ...p.hours, to: e.target.value } })} />
          </div>
        ) : null}
        <h4>Features</h4>
        {FEATURES.map((f) => {
          const on = Boolean(p.consents[f.id]);
          return (
            <div key={f.id} className="conn" style={{ opacity: p.mode === "none" ? 0.55 : 1 }}>
              <div className="row">
                <b>{f.label}</b>
                <Sensitive />
                <span className="grow" />
                {on ? <span className="pill warn">On{p.mode === "conditional" ? ` · ${p.hours.from}–${p.hours.to}` : ""}</span> : <span className="pill">Off</span>}
                <button
                  className="btn small"
                  disabled={p.mode === "none" && !on}
                  onClick={() => {
                    if (on) {
                      set({ consents: { ...p.consents, [f.id]: false } });
                      desk().log(`Opted out: ${f.label}.`);
                    } else setRisk(f.id);
                  }}
                >
                  {on ? "Turn off" : "Turn on…"}
                </button>
              </div>
              <p className="small muted" style={{ margin: "6px 0 0" }}>
                {f.risk}
              </p>
            </div>
          );
        })}
        <div className="divider" />
        <h4>Streamer mode</h4>
        <p className="small muted">For streaming or screen sharing. The characters stay on screen; what comes in from Discord and Vector is masked.</p>
        <label className="check">
          <input type="checkbox" checked={p.streamer.on} onChange={(e) => set({ streamer: { ...p.streamer, on: e.target.checked } })} />
          <span>Streamer mode on</span>
        </label>
        <div style={{ paddingLeft: 26, opacity: p.streamer.on ? 1 : 0.5 }}>
          <label className="check">
            <input type="checkbox" checked={p.streamer.maskNames} onChange={(e) => set({ streamer: { ...p.streamer, maskNames: e.target.checked } })} />
            <span>Hide the names of people on Discord and Vector</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={p.streamer.maskMessages} onChange={(e) => set({ streamer: { ...p.streamer, maskMessages: e.target.checked } })} />
            <span>Hide what they wrote</span>
          </label>
          <div className="field" style={{ marginTop: 6 }}>
            <span>Always anonymous (people or AIs who'd rather not be named on stream)</span>
            <div className="row">
              <input className="input" style={{ maxWidth: 220 }} value={anon} onChange={(e) => setAnon(e.target.value)} placeholder="Name" />
              <button className="btn small" disabled={!anon.trim()} onClick={() => (set({ anonymous: [...p.anonymous, anon.trim()] }), setAnon(""))}>
                Add
              </button>
            </div>
            <div className="row">
              {p.anonymous.map((n) => (
                <span key={n} className="pill">
                  {n}
                  <button className="x" style={{ border: 0, background: "none", color: "inherit" }} onClick={() => set({ anonymous: p.anonymous.filter((x) => x !== n) })} aria-label={`Remove ${n}`}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      </fieldset>
      {risk ? <RiskDialog feature={risk} onClose={() => setRisk(null)} /> : null}
    </>
  );
}

function AccountsSection() {
  const s = useDesk();
  const keyholder = s.role() === "keyholder";
  const first = s.accounts.length === 0;
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("resident");
  const [pass, setPass] = useState("");
  const [picture, setPicture] = useState("");
  const [note, setNote] = useState("");
  const [remove, setRemove] = useState<Account | null>(null);
  const [big, setBig] = useState("");

  const add = async () => {
    const clean = name.trim().replace(/\s+/g, " ").slice(0, 32);
    if (!clean) return;
    if (s.accounts.some((a) => a.name.toLowerCase() === clean.toLowerCase())) return setNote("That name is taken.");
    try {
      const sealed = pass ? await seal(pass) : null;
      const acct: Account = { name: clean, role: first ? "keyholder" : role, picture, sealed };
      desk().set({ accounts: [...desk().accounts, acct], ...(first ? { session: clean } : {}) });
      setName("");
      setPass("");
      setPicture("");
      setNote(first ? "You hold the keys now. The desktop opens to the account list from now on." : `${clean} can now open the desktop.`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <h2>Accounts</h2>
      <p className="lead small">
        Accounts live only on this computer. The first one holds the keys: privacy, Keys, the flood gate and the adult shelf answer to them. An account can have no password (its picture opens it) or a password, kept as a salted hash and never stored as itself.
      </p>
      {!canSeal() ? <div className="note warn small">Passwords need this page on localhost or https.</div> : null}
      {s.accounts.map((a) => (
        <div key={a.name} className="kv" style={{ gridTemplateColumns: "auto 1fr auto" }}>
          <button className="face-btn" style={{ width: "auto", padding: 0 }} onClick={() => a.picture && setBig(a.picture)} aria-label="Show picture">
            <PersonAvatar name={a.name} picture={a.picture} size={36} />
          </button>
          <span>
            <b>{a.name}</b> <span className="muted small">· {a.role === "keyholder" ? "keyholder" : a.role === "resident" ? "resident" : "guest"} · {a.sealed ? "password" : "no password"}{s.kept === a.name ? " · remembered here" : ""}</span>
          </span>
          {keyholder && a.role !== "keyholder" ? (
            <button className="icon-btn" aria-label={`Remove ${a.name}`} onClick={() => setRemove(a)}>
              <Trash2 size={14} />
            </button>
          ) : (
            <span />
          )}
        </div>
      ))}
      {keyholder ? (
        <>
          <h4 style={{ marginTop: 16 }}>{first ? "Create the keyholder account" : "Add an account"}</h4>
          <div className="row">
            <input className="input" style={{ maxWidth: 200 }} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
            {!first ? (
              <select className="select" style={{ width: 150 }} value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="resident">Resident</option>
                <option value="general">Guest</option>
                <option value="keyholder">Keyholder</option>
              </select>
            ) : null}
            <input className="input" style={{ maxWidth: 200 }} type="password" placeholder="Password (optional)" value={pass} onChange={(e) => setPass(e.target.value)} />
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <label className="btn">
              {picture ? "Change picture" : "Picture from this device…"}
              <input type="file" accept="image/*" hidden onChange={async (e) => e.target.files?.[0] && setPicture(await shrinkPicture(e.target.files[0]).catch(() => ""))} />
            </label>
            {picture ? <img src={picture} alt="" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }} /> : null}
            <button className="btn primary" disabled={!name.trim()} onClick={() => void add()}>
              <Plus size={14} /> {first ? "Create" : "Add"}
            </button>
          </div>
          {!pass && name ? <p className="small faint">No password: anyone at this computer can open it by clicking the picture.</p> : null}
        </>
      ) : null}
      {note ? <div className="note small" style={{ marginTop: 10 }}>{note}</div> : null}
      {remove ? (
        <Confirm title={`Remove ${remove.name}?`} body={<p>They won't be able to open the desktop any more.</p>} yes="Remove" danger onYes={() => desk().set({ accounts: desk().accounts.filter((a) => a.name !== remove.name), kept: desk().kept === remove.name ? null : desk().kept })} onClose={() => setRemove(null)} />
      ) : null}
      {big ? (
        <div className="scrim" onClick={() => setBig("")}>
          <img className="big-picture" src={big} alt="" />
        </div>
      ) : null}
    </>
  );
}

function AdultSection() {
  const s = useDesk();
  const keyholder = s.role() === "keyholder";
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [old, setOld] = useState("");
  const [note, setNote] = useState("");
  const adults = s.allCharacters().filter((c) => c.shelf === "adult");

  const setCode = async () => {
    if (a.length < 4) return setNote("Use at least four characters.");
    if (a !== b) return setNote("Those don't match.");
    if (s.adult && !(await matches(old, s.adult))) return setNote("The current passcode doesn't match.");
    desk().set({ adult: await seal(a) });
    setA("");
    setB("");
    setOld("");
    setNote("Passcode saved. Setting it doesn't open the shelf; unlocking does.");
  };
  const unlock = async () => {
    if (s.adult && (await matches(a, s.adult))) {
      desk().set({ adultOpen: true });
      setNote("");
    } else setNote("That passcode doesn't match.");
    setA("");
  };
  const lock = () => desk().set({ adultOpen: false, sensorPass: false, members: desk().members.filter((id) => desk().character(id)?.shelf !== "adult") });

  return (
    <>
      <h2>
        Adult shelf <Sensitive />
      </h2>
      <p className="lead small">
        The desktop always starts in family mode. Characters meant for adults stay hidden until the shelf is unlocked with the passcode, and it locks again when the desktop is closed or locked. This keeps a shared computer family-friendly; it isn't a safe against someone who can clear the browser's data.
      </p>
      {adults.length ? <p className="small muted">On the shelf: {adults.map((c) => c.name).join(", ")}.</p> : null}
      {s.adultOpen ? (
        <div className="row">
          <span className="pill warn">Open for this session</span>
          <button className="btn" onClick={lock}>
            Lock it now
          </button>
        </div>
      ) : s.adult ? (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            void unlock();
          }}
        >
          <input className="input" type="password" style={{ maxWidth: 220 }} placeholder="Passcode" value={a} onChange={(e) => setA(e.target.value)} />
          <button className="btn primary">Unlock for this session</button>
        </form>
      ) : null}
      {keyholder ? (
        <>
          <h4 style={{ marginTop: 18 }}>{s.adult ? "Change the passcode" : "Set a passcode"}</h4>
          {s.adult ? <input className="input" type="password" style={{ maxWidth: 260, marginBottom: 8 }} placeholder="Current passcode" value={old} onChange={(e) => setOld(e.target.value)} /> : null}
          <div className="row">
            <input className="input" type="password" style={{ maxWidth: 200 }} placeholder="New passcode" value={s.adultOpen || !s.adult ? a : ""} onChange={(e) => setA(e.target.value)} />
            <input className="input" type="password" style={{ maxWidth: 200 }} placeholder="Again" value={b} onChange={(e) => setB(e.target.value)} />
            <button className="btn" onClick={() => void setCode()}>
              Save passcode
            </button>
          </div>
        </>
      ) : null}
      {note ? <div className="note small" style={{ marginTop: 10 }}>{note}</div> : null}
    </>
  );
}

function BackupSection() {
  const [reset, setReset] = useState(false);
  const keyholder = useDesk((s) => s.role() === "keyholder");
  const exportAll = () => {
    const s = desk();
    download(`pandora-desktop-${new Date().toISOString().slice(0, 10)}.json`, {
      format: "pandora-dee-desktop",
      version: 1,
      custom: s.custom.filter((c) => c.shelf !== "adult" || s.adultOpen),
      files: Object.fromEntries(Object.entries(s.files).filter(([id]) => s.character(id)?.shelf !== "adult" || s.adultOpen)),
      charPrefs: s.charPrefs,
      members: s.members,
      messages: s.messages,
      model: { ...s.model },
      mcp: s.mcp,
      bridges: s.bridges,
      privacy: s.privacy,
      voice: s.voice,
      envNames: Object.keys(s.env),
    });
    s.say("Saved. Keys, passwords and the adult passcode were left out.");
  };
  const importAll = async (f: File) => {
    try {
      const d = JSON.parse(await f.text()) as Record<string, unknown>;
      if (d.format !== "pandora-dee-desktop") return desk().say("That isn't a desktop export. For one character, use File → Load a character backup.");
      const s = desk();
      const env = { ...s.env };
      for (const n of (d.envNames as string[]) ?? []) if (env[n] === undefined) env[n] = "";
      s.set({
        custom: (d.custom as typeof s.custom) ?? s.custom,
        files: { ...s.files, ...((d.files as typeof s.files) ?? {}) },
        charPrefs: (d.charPrefs as typeof s.charPrefs) ?? s.charPrefs,
        members: (d.members as string[]) ?? s.members,
        messages: (d.messages as typeof s.messages) ?? s.messages,
        model: (d.model as typeof s.model) ?? s.model,
        mcp: (d.mcp as typeof s.mcp) ?? s.mcp,
        bridges: (d.bridges as typeof s.bridges) ?? s.bridges,
        privacy: (d.privacy as typeof s.privacy) ?? s.privacy,
        voice: (d.voice as typeof s.voice) ?? s.voice,
        env,
      });
      s.say("Everything was brought in. Add the keys again in Keys.");
    } catch {
      desk().say("Couldn't read that file.");
    }
  };
  return (
    <>
      <h2>Backup and reset</h2>
      <p className="lead small">Save the whole desktop (characters, their files, the conversation and settings) to one file, or bring it back. Keys, passwords and the adult passcode never go into the file.</p>
      <div className="row">
        <button className="btn primary" onClick={exportAll}>
          Save everything…
        </button>
        <label className="btn">
          Bring everything back…
          <input type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && void importAll(e.target.files[0])} />
        </label>
      </div>
      <ServerBackup />
      <div className="divider" />
      <h4>Start over</h4>
      <p className="small muted">Deletes everything on this desktop in this browser: characters you made, files, memories, journals, accounts, keys and settings.</p>
      <button className="btn danger" disabled={!keyholder} onClick={() => setReset(true)}>
        Reset the desktop…
      </button>
      {reset ? (
        <Confirm
          title="Reset everything?"
          body={<p>This can't be undone. Save everything first if you might want it back.</p>}
          yes="Reset"
          danger
          onYes={() => {
            localStorage.removeItem("pandora-dee-desktop");
            sessionStorage.clear();
            location.reload();
          }}
          onClose={() => setReset(false)}
        />
      ) : null}
    </>
  );
}

const DOCK_LABEL: Record<string, string> = { hangout: "Hangout", classic: "Classic", "|": "Divider" };
const dockName = (id: string) => DOCK_LABEL[id] ?? APPS.find((a) => a.id === id)?.title ?? id;

function DockSection() {
  const s = useDesk();
  const d = s.dock;
  const set = (p: Partial<DockPrefs>) => desk().set({ dock: { ...desk().dock, ...p } });
  const all: DockPrefs["items"] = [...APPS.map((a) => a.id), "hangout", "classic"];
  const missing = all.filter((id) => !d.items.includes(id));
  const move = (i: number, step: number) => {
    const items = [...d.items];
    const j = i + step;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    set({ items });
  };
  return (
    <>
      <h2>Dock</h2>
      <p className="lead small">The bar of apps. Drag it by its grip to anywhere on the screen (let go near an edge to dock it there), and right-click it for these options.</p>
      <label className="field">
        <span>Where it sits</span>
        <Seg
          value={d.edge}
          options={[
            { id: "bottom", label: "Bottom" },
            { id: "left", label: "Left" },
            { id: "right", label: "Right" },
            { id: "top", label: "Top" },
            { id: "float", label: "Floating" },
          ]}
          onChange={(edge) => set(edge === "float" ? { edge, float: d.float ?? { x: Math.max(4, window.innerWidth / 2 - 200), y: Math.max(40, window.innerHeight - 140), vertical: false } } : { edge })}
        />
      </label>
      {d.edge === "float" ? (
        <label className="check">
          <input type="checkbox" checked={Boolean(d.float?.vertical)} onChange={(e) => set({ float: { x: d.float?.x ?? 40, y: d.float?.y ?? 40, vertical: e.target.checked } })} />
          <span>Upright (a column instead of a row)</span>
        </label>
      ) : (
        <label className="check">
          <input type="checkbox" checked={d.autoHide} onChange={(e) => set({ autoHide: e.target.checked })} />
          <span>Hide it until the pointer reaches its edge (or swipe in from that edge)</span>
        </label>
      )}
      <label className="check">
        <input type="checkbox" checked={d.labels} onChange={(e) => set({ labels: e.target.checked })} />
        <span>Show names under the icons</span>
      </label>
      <label className="field" style={{ maxWidth: 380 }}>
        <span>Icon size (px)</span>
        <Num min={30} max={72} value={d.size} onChange={(n) => set({ size: n })} />
      </label>
      <h4 style={{ marginTop: 14 }}>What's on it</h4>
      <div className="versions">
        {d.items.map((id, i) => (
          <div key={`${id}-${i}`} className="version">
            <span className="faint" style={{ width: 26, display: "grid", placeItems: "center" }}>
              {id === "|" ? "—" : id in ICONS ? ICONS[id as AppId](16) : null}
            </span>
            <span className="grow">{dockName(id)}</span>
            <button className="icon-btn" aria-label={`Move ${dockName(id)} earlier`} disabled={i === 0} onClick={() => move(i, -1)}>
              <ChevronUp size={14} />
            </button>
            <button className="icon-btn" aria-label={`Move ${dockName(id)} later`} disabled={i === d.items.length - 1} onClick={() => move(i, 1)}>
              <ChevronDown size={14} />
            </button>
            <button className="icon-btn" aria-label={`Remove ${dockName(id)} from the dock`} onClick={() => set({ items: d.items.filter((_, j) => j !== i) })}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        {missing.map((id) => (
          <button key={id} className="btn small" onClick={() => set({ items: [...d.items, id] })}>
            <Plus size={13} /> {dockName(id)}
          </button>
        ))}
        <button className="btn small" onClick={() => set({ items: [...d.items, "|"] })}>
          <Plus size={13} /> Divider
        </button>
      </div>
      <p className="small faint" style={{ marginTop: 8 }}>
        Settings stays reachable even if you take it off the dock: {showCombo("Mod+,")}, the menu bar, or right-click the dock.
      </p>
      <button className="btn small" style={{ marginTop: 6 }} onClick={() => desk().set({ dock: DOCK_DEFAULT })}>
        Reset the dock
      </button>
    </>
  );
}

function ScenePreview() {
  const s = useDesk();
  const focus = s.character(s.focus);
  const c = s.hang.scene === "focus" ? focus : s.character(s.hang.scene) ?? focus;
  const src = s.hang.customScene || c?.art.background;
  return src ? (
    <div className="scene-preview" style={{ backgroundImage: `url("${src}")` }} aria-label="Scene preview" />
  ) : (
    <div className="scene-preview plain small faint">{c ? `${c.name} has no scene picture yet` : "No scene"}</div>
  );
}

function HangoutSection() {
  const s = useDesk();
  const h = s.hang;
  const set = (p: Partial<typeof h>) => desk().set({ hang: { ...desk().hang, ...p } });
  const chars = s.visibleCharacters().filter((c) => c.art.background);
  return (
    <>
      <h2>Hangout</h2>
      <p className="lead small">
        Hangout puts everything else away: just a scene, the characters standing in it, and a slim chat bar. Open it from the dock, View → Hangout, or {showCombo("Mod+Shift+H")}. Esc comes back.
      </p>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn primary" onClick={() => desk().set({ hangout: true })}>
          Open Hangout
        </button>
      </div>
      <label className="check">
        <input type="checkbox" checked={h.onDesktop} onChange={(e) => set({ onDesktop: e.target.checked })} />
        <span>Also let the characters stand on the normal desktop, behind the windows</span>
      </label>
      <h4 style={{ marginTop: 14 }}>Scene</h4>
      <p className="small faint" style={{ marginTop: 0 }}>The backdrop in Hangout, and the desktop's wallpaper when the wallpaper is on in Look.</p>
      <ScenePreview />
      <div className="row" style={{ marginBottom: 8 }}>
        <select className="select" style={{ width: "auto" }} value={h.scene} onChange={(e) => set({ scene: e.target.value })} aria-label="Scene">
          <option value="focus">Whoever is in focus</option>
          {chars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}'s scene
            </option>
          ))}
        </select>
        <label className="btn small">
          {h.customScene ? "Change my picture" : "Use a picture from this device…"}
          <input type="file" accept="image/*" hidden onChange={async (e) => e.target.files?.[0] && set({ customScene: await shrinkPicture(e.target.files[0], 2400).catch(() => "") })} />
        </label>
        {h.customScene ? (
          <button className="btn small" onClick={() => set({ customScene: "" })}>
            Remove my picture
          </button>
        ) : null}
      </div>
      <label className="field" style={{ maxWidth: 380 }}>
        <span>Scene brightness</span>
        <Num min={0} max={1} step={0.05} value={1 - h.dim / 0.8} onChange={(n) => set({ dim: Math.round((1 - n) * 0.8 * 1000) / 1000 })} percent />
      </label>
      <h4 style={{ marginTop: 14 }}>Characters</h4>
      <label className="field">
        <span>How they appear (each character can override this from their menu)</span>
        <Seg
          value={h.style}
          options={[
            { id: "chibi", label: "Chibi" },
            { id: "talking", label: "Talking bust" },
          ]}
          onChange={(style) => set({ style })}
        />
      </label>
      <label className="field" style={{ maxWidth: 380 }}>
        <span>Size, as a share of the screen's height</span>
        <Num min={0.2} max={0.8} step={0.02} value={h.size} onChange={(n) => set({ size: n })} percent />
      </label>
      <label className="check">
        <input type="checkbox" checked={h.wander} onChange={(e) => set({ wander: e.target.checked })} />
        <span>Let them wander a little</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={h.bubbles} onChange={(e) => set({ bubbles: e.target.checked })} />
        <span>Speech bubbles over whoever is talking</span>
      </label>
      <label className="field" style={{ maxWidth: 380 }}>
        <span>Bubbles stay for (seconds)</span>
        <Num min={4} max={60} value={h.bubbleSeconds} onChange={(n) => set({ bubbleSeconds: n })} />
      </label>
      <button className="btn small" onClick={() => desk().set({ spots: {} })}>
        Put everyone back in their spots
      </button>
      <h4 style={{ marginTop: 14 }}>Chat</h4>
      <label className="field" style={{ maxWidth: 380 }}>
        <span>Recent lines above the chat bar</span>
        <Num min={0} max={10} value={h.lines} onChange={(n) => set({ lines: n })} />
      </label>
      <label className="check">
        <input type="checkbox" checked={h.pinControls} onChange={(e) => set({ pinControls: e.target.checked })} />
        <span>Keep the controls showing (otherwise they fade when you're not moving the pointer)</span>
      </label>
      <button className="btn small" style={{ marginTop: 10 }} onClick={() => desk().set({ hang: HANG_DEFAULT })}>
        Reset Hangout settings
      </button>
    </>
  );
}

function ShortcutsSection() {
  const s = useDesk();
  const [listening, setListening] = useState<string | null>(null);
  useEffect(() => {
    if (!listening) return;
    const on = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") return setListening(null);
      const combo = comboOf(e);
      if (!combo.includes("+") || /(\+|^)(Mod|Alt|Shift)$/.test(combo)) return;
      const clash = ACTIONS.find((a) => a.id !== listening && bindingOf(a) === combo);
      desk().set({ keys: { ...desk().keys, [listening]: combo, ...(clash ? { [clash.id]: "" } : {}) } });
      if (clash) desk().say(`${showCombo(combo)} was on "${clash.label}", which now has no shortcut.`);
      setListening(null);
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, [listening]);
  const groups = [...new Set(ACTIONS.map((a) => a.group))];
  return (
    <>
      <h2>Keyboard</h2>
      <p className="lead small">Click a shortcut, then press the keys you want. Esc cancels. Shortcuts that use Ctrl/⌘ with Shift also work while a game or app has the keyboard.</p>
      {groups.map((g) => (
        <div key={g} style={{ marginBottom: 14 }}>
          <h4>{g}</h4>
          {ACTIONS.filter((a) => a.group === g).map((a) => {
            const combo = bindingOf(a);
            return (
              <div key={a.id} className="kv" style={{ gridTemplateColumns: "1fr auto auto" }}>
                <span>{a.label}</span>
                <button className={`kbd-key${listening === a.id ? " listening" : ""}`} onClick={() => setListening(a.id)}>
                  {listening === a.id ? "Press keys…" : combo ? showCombo(combo) : "None"}
                </button>
                <button
                  className="btn small ghost"
                  disabled={!(a.id in s.keys)}
                  onClick={() => {
                    const keys = { ...desk().keys };
                    delete keys[a.id];
                    desk().set({ keys });
                  }}
                >
                  Default
                </button>
              </div>
            );
          })}
        </div>
      ))}
      <h4>Always</h4>
      <div className="small muted" style={{ lineHeight: 1.8 }}>
        In Hangout: Enter or / to type · 1–6 picks who answers · Esc back to the desktop
        <br />
        In Games & Apps: arrows move · Enter plays · Space shows details · F favourites
        <br />
        In the Room: Enter sends · Shift+Enter makes a new line
      </div>
      <button className="btn small" style={{ marginTop: 12 }} onClick={() => desk().set({ keys: {} })}>
        Reset every shortcut
      </button>
    </>
  );
}

function NotesSection() {
  const n = useDesk((s) => s.notes);
  const set = (p: Partial<NotesPrefs>) => desk().set({ notes: { ...desk().notes, ...p } });
  return (
    <>
      <h2>Notes</h2>
      <p className="lead small">Your notes are markdown files in the desktop's data folder (vault). These choices are about where things go.</p>
      <label className="field" style={{ maxWidth: 420 }}>
        <span>Templates folder (notes here show under the {"{ }"} button)</span>
        <input className="input" value={n.templates} onChange={(e) => set({ templates: e.target.value })} />
      </label>
      <label className="field" style={{ maxWidth: 420 }}>
        <span>Daily notes folder</span>
        <input className="input" value={n.daily} onChange={(e) => set({ daily: e.target.value })} />
      </label>
      <label className="field" style={{ maxWidth: 420 }}>
        <span>Daily note name (YYYY year, MM month, DD day, dddd weekday)</span>
        <input className="input" value={n.dailyFormat} onChange={(e) => set({ dailyFormat: e.target.value })} />
        <span className="small faint">Today: {formatDate(new Date(), n.dailyFormat || "YYYY-MM-DD")}.md</span>
      </label>
      <label className="field" style={{ maxWidth: 420 }}>
        <span>Template for new daily notes (empty: {n.templates}/Daily note.md when it exists)</span>
        <input className="input" value={n.dailyTemplate} placeholder={`${n.templates}/Daily note.md`} onChange={(e) => set({ dailyTemplate: e.target.value })} />
      </label>
      <h4 style={{ marginTop: 14 }}>Opening a note</h4>
      <Seg
        value={n.view}
        onChange={(view) => set({ view })}
        options={[
          { id: "edit", label: "Edit" },
          { id: "split", label: "Edit and read side by side" },
          { id: "read", label: "Read" },
        ]}
      />
      <label className="check" style={{ marginTop: 10 }}>
        <input type="checkbox" checked={n.panel} onChange={(e) => set({ panel: e.target.checked })} />
        <span>Show the links, tags and nearby-notes panel</span>
      </label>
      <p className="small faint" style={{ marginTop: 12 }}>
        Templates fill in tags like {'<% tp.date.now("YYYY-MM-DD") %>'} and {"<% tp.file.title %>"}. Templates that run code ({"<%* … %>"}) and note scripts arrive with the Runtimes batch.
        Pictures from the internet in notes load only when web access is on in Privacy.
      </p>
    </>
  );
}

function ConversationSection() {
  const c = useDesk((s) => s.chat);
  const conns = useDesk((s) => s.model.connections);
  const set = (p: Partial<ChatPrefs>) => desk().set({ chat: { ...desk().chat, ...p } });
  const [format, setFormat] = useState<Format>("openai");
  const [filter, setFilter] = useState<Filter>("not-disliked");
  const [status, setStatus] = useState("");
  const exportNow = async () => {
    setStatus("Collecting…");
    try {
      const { text, count } = await exportJsonl(format, filter);
      if (!count) return setStatus("Nothing to export yet.");
      const url = URL.createObjectURL(new Blob([text], { type: "application/jsonl" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `pandora-trajectories-${format}-${new Date().toISOString().slice(0, 10)}.jsonl`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setStatus(`Exported ${count} repl${count === 1 ? "y" : "ies"}.`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Couldn't export.");
    }
  };
  return (
    <>
      <h2>Conversations</h2>
      <p className="lead small">How much of a chat the characters read, keeping long chats short, and what happens when a chat ends. Chats are saved as files in the desktop's data folder (vault/.pandora/chats).</p>

      <h4>Context</h4>
      <label className="field" style={{ maxWidth: 420 }}>
        <span>Messages sent with each reply</span>
        <Num min={4} max={400} typedMax={100000} value={c.historyLimit} onChange={(n) => set({ historyLimit: n })} />
      </label>
      <label className="field" style={{ maxWidth: 420 }}>
        <span>Context window for Ollama models (num_ctx, tokens; 0 = the model's own)</span>
        <Num min={0} max={1048576} typedMax={100000000} step={1024} value={c.numCtx} onChange={(n) => set({ numCtx: n })} />
      </label>
      <label className="check">
        <input type="checkbox" checked={c.stampTimes} onChange={(e) => set({ stampTimes: e.target.checked })} />
        <span>Put the date and time on every message the characters read</span>
      </label>

      <h4 style={{ marginTop: 14 }}>Compacting long chats</h4>
      <p className="small faint">Older messages are summarised and the summary is sent instead. You still see every message. /compact does it by hand; /context shows how full it is.</p>
      <label className="field" style={{ maxWidth: 420 }}>
        <span>Compact after this many messages (0 = off)</span>
        <Num min={0} max={1000} typedMax={1000000} value={c.compactAfter} onChange={(n) => set({ compactAfter: n })} />
      </label>
      <label className="field" style={{ maxWidth: 420 }}>
        <span>Compact when the context is this full (%; 0 = off)</span>
        <Num min={0} max={95} value={c.compactAtPct} onChange={(n) => set({ compactAtPct: n })} />
      </label>
      <label className="field" style={{ maxWidth: 420 }}>
        <span>Keep the most recent messages word for word</span>
        <Num min={2} max={100} value={c.keepRecent} onChange={(n) => set({ keepRecent: n })} />
      </label>
      <label className="field" style={{ maxWidth: 420 }}>
        <span>Write summaries with</span>
        <select value={c.compactConn} onChange={(e) => set({ compactConn: e.target.value })}>
          <option value="">The character's own connection</option>
          {conns.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </label>
      {c.compactConn ? (
        <label className="field" style={{ maxWidth: 420 }}>
          <span>Model for summaries (empty = that connection's model)</span>
          <input value={c.compactModel} placeholder="e.g. qwen3:4b" onChange={(e) => set({ compactModel: e.target.value })} />
        </label>
      ) : null}

      <h4 style={{ marginTop: 14 }}>When a chat ends</h4>
      <p className="small faint">A chat ends when you start a new one or switch to another. This runs in the background and uses the AI connection.</p>
      <label className="check">
        <input type="checkbox" checked={c.autoJournal} onChange={(e) => set({ autoJournal: e.target.checked })} />
        <span>Each character who spoke writes a journal entry about it</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={c.learnFacts} onChange={(e) => set({ learnFacts: e.target.checked })} />
        <span>…and keeps anything they learned in their memory</span>
      </label>

      <h4 style={{ marginTop: 14 }}>Skills</h4>
      <label className="check">
        <input type="checkbox" checked={c.skillRouter} onChange={(e) => set({ skillRouter: e.target.checked })} />
        <span>Skill router: when a character has more than {ROUTER_AT} skills, leave the list out of their prompt and let them look skills up (saves context)</span>
      </label>

      <h4 style={{ marginTop: 14 }}>Trajectories (for fine-tuning)</h4>
      <p className="small faint">
        Logs each reply (the prompt, tool calls and answer) to vault/.pandora/trajectories on this computer. They contain your conversations and the characters' memory, so
        only share an export with people you'd show those to.
      </p>
      <label className="check">
        <input type="checkbox" checked={c.trajectories} onChange={(e) => set({ trajectories: e.target.checked })} />
        <span>Log replies</span>
      </label>
      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
        <Seg value={format} onChange={setFormat} options={[{ id: "openai", label: "OpenAI tools" }, { id: "sharegpt", label: "ShareGPT" }]} />
        <Seg value={filter} onChange={setFilter} options={[{ id: "all", label: "All" }, { id: "not-disliked", label: "Skip 👎" }, { id: "liked", label: "Only 👍" }]} />
        <button className="btn" onClick={() => void exportNow()}>
          Export JSONL
        </button>
        {status ? <span className="small muted">{status}</span> : null}
      </div>
    </>
  );
}

function ClockSection() {
  const c = useDesk((s) => s.clock);
  const set = (p: Partial<ClockPrefs>) => desk().set({ clock: { ...desk().clock, ...p } });
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const [zoneText, setZoneText] = useState(c.zone);
  const [localeText, setLocaleText] = useState(c.locale);
  const all = zones();
  const here = Intl.DateTimeFormat().resolvedOptions();
  return (
    <>
      <h2>Clock</h2>
      <p className="lead small">The time in the menu bar. Right-click it (or hold it on a touch screen) for the quick options.</p>
      <div className="note" style={{ fontSize: 18, fontVariantNumeric: "tabular-nums", marginBottom: 12 }}>{formatClock(now, c)}</div>
      <label className="check">
        <input type="checkbox" checked={c.date} onChange={(e) => set({ date: e.target.checked })} />
        <span>Show the date</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={c.weekday} onChange={(e) => set({ weekday: e.target.checked })} />
        <span>Show the day of the week</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={c.seconds} onChange={(e) => set({ seconds: e.target.checked })} />
        <span>Show seconds</span>
      </label>
      <h4 style={{ marginTop: 14 }}>Hours</h4>
      <Seg value={c.hours} onChange={(hours) => set({ hours })} options={[{ id: "auto", label: "As the region does" }, { id: "12", label: "12-hour" }, { id: "24", label: "24-hour" }]} />
      <h4 style={{ marginTop: 14 }}>Date style</h4>
      <Seg value={c.dateStyle} onChange={(dateStyle) => set({ dateStyle })} options={[{ id: "numeric", label: "Numbers" }, { id: "short", label: "Short" }, { id: "long", label: "Long" }]} />
      <label className="field" style={{ maxWidth: 420, marginTop: 14 }}>
        <span>Time zone</span>
        <input
          list="pdd-zones"
          value={zoneText}
          placeholder={`This computer's (${here.timeZone})`}
          onChange={(e) => {
            setZoneText(e.target.value);
            const z = e.target.value.trim();
            if (validZone(z)) set({ zone: z });
          }}
        />
        <datalist id="pdd-zones">
          {all.map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
        {zoneText.trim() && !validZone(zoneText.trim()) ? <span className="small" style={{ color: "var(--bad)" }}>Not a time zone this browser knows. Try a city, like Europe/London.</span> : null}
      </label>
      <label className="field" style={{ maxWidth: 420 }}>
        <span>Region (date order, month and day names)</span>
        <select
          value={REGIONS.some((r) => r.tag === c.locale) || !c.locale ? c.locale : "other"}
          onChange={(e) => {
            const v = e.target.value === "other" ? localeText : e.target.value;
            setLocaleText(v);
            if (validLocale(v)) set({ locale: v });
          }}
        >
          <option value="">This computer's ({here.locale})</option>
          {REGIONS.map((r) => (
            <option key={r.tag} value={r.tag}>
              {r.label}
            </option>
          ))}
          <option value="other">Other…</option>
        </select>
      </label>
      <label className="field" style={{ maxWidth: 420 }}>
        <span>Or type a region code</span>
        <input
          value={localeText}
          placeholder="e.g. en-NZ, fr-CA, hi-IN"
          onChange={(e) => {
            setLocaleText(e.target.value);
            const v = e.target.value.trim();
            if (validLocale(v)) set({ locale: v });
          }}
        />
        {localeText.trim() && !validLocale(localeText.trim()) ? <span className="small" style={{ color: "var(--bad)" }}>Not a region code this browser knows.</span> : null}
      </label>
      <button className="btn" style={{ marginTop: 8 }} onClick={() => (set(CLOCK_DEFAULT), setZoneText(""), setLocaleText(""))}>
        Back to the defaults
      </button>
    </>
  );
}

function TouchSection() {
  const s = useDesk();
  const set = (p: Partial<typeof s.touch>) => desk().set({ touch: { ...desk().touch, ...p } });
  return (
    <>
      <h2>Touch</h2>
      <p className="lead small">For phones, tablets and touch screens.</p>
      <label className="check">
        <input type="checkbox" checked={s.touch.doubleTapScene} onChange={(e) => set({ doubleTapScene: e.target.checked })} />
        <span>Double-tap an empty part of the desktop to open Hangout</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={s.touch.edgeSwipe} onChange={(e) => set({ edgeSwipe: e.target.checked })} />
        <span>Swipe in from the dock's edge to show a hidden dock, and swipe up in Hangout to start typing</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={s.touch.longPress} onChange={(e) => set({ longPress: e.target.checked })} />
        <span>Hold a character in Hangout, or the clock, for their options (right-click does the same with a mouse)</span>
      </label>
      <h4 style={{ marginTop: 14 }}>Always</h4>
      <div className="small muted" style={{ lineHeight: 1.8 }}>
        Tap a character to have them answer · drag a character to move them · drag a window's title bar to move it, its edges to resize it · double-tap a title bar to maximize · drag the games list to scroll it
      </div>
    </>
  );
}

function ClassicSection() {
  const s = useDesk();
  const [index, setIndex] = useState<Record<ClassicApp, { version: string }[]> | null>(null);
  useEffect(() => {
    fetch("/classic/index.json")
      .then((r) => r.json())
      .then(setIndex)
      .catch(() => setIndex(null));
  }, []);
  const label: Record<ClassicApp, string> = { pandora: "Pandora Dee", jade: "Jade Vault" };
  return (
    <>
      <h2>Classic</h2>
      <div style={{ margin: "4px 0 14px" }}>
        <ViaPicker
          label="How the Classic apps reach models, tool servers and SearXNG (inside the desktop)"
          value={s.classicVia}
          onChange={(v) => desk().set({ classicVia: v ?? "desktop" })}
        />
      </div>
      <p className="lead small">
        Classic is the original app, full screen, exactly as released. The small round button in its corner switches between Pandora Dee and Jade Vault and their versions, or brings you back ({showCombo("Mod+Shift+K")}). Each app keeps its own notes and settings.
      </p>
      {(["pandora", "jade"] as ClassicApp[]).map((app) => (
        <div key={app} className="row" style={{ marginBottom: 10 }}>
          <label className="check" style={{ padding: 0, width: 160 }}>
            <input type="radio" name="classic-app" checked={s.classicApp === app} onChange={() => desk().set({ classicApp: app })} />
            <span>{label[app]}</span>
          </label>
          <select
            className="select"
            style={{ width: "auto" }}
            value={s.classicVersion[app]}
            onChange={(e) => desk().set({ classicVersion: { ...s.classicVersion, [app]: e.target.value } })}
            aria-label={`${label[app]} version`}
          >
            <option value="">Latest</option>
            {(index?.[app] ?? []).map((b) => (
              <option key={b.version} value={b.version}>
                {b.version}
              </option>
            ))}
          </select>
        </div>
      ))}
      <button className="btn primary" onClick={() => desk().set({ classic: true })}>
        Open Classic
      </button>
    </>
  );
}

function StorageSection() {
  const [info, setInfo] = useState<{ dataDir: string; xdcDir: string; fromEnv?: boolean } | null>(null);
  const [target, setTarget] = useState("");
  const [move, setMove] = useState(true);
  const [note, setNote] = useState("");
  useEffect(() => {
    library
      .info()
      .then((i) => {
        setInfo(i);
        setTarget(i.dataDir);
      })
      .catch(() => setInfo(null));
  }, []);
  const apply = async () => {
    setNote(move ? "Copying the library…" : "");
    try {
      const res = await fetch("/api/storage", { method: "POST", body: JSON.stringify({ dataDir: target, move }) });
      const j = (await res.json()) as { dataDir?: string; previous?: string; error?: string };
      if (!res.ok) throw new Error(j.error);
      setInfo((i) => (i ? { ...i, dataDir: j.dataDir! } : i));
      window.dispatchEvent(new Event("pdd-xdc-changed"));
      setNote(j.previous && move ? `Done. The library now lives in ${j.dataDir}. The old copy in ${j.previous} is still there; delete it when you're happy.` : `The library now lives in ${j.dataDir}.`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <>
      <h2>Storage</h2>
      <p className="lead small">Vector apps, every version of them, and their saved game state live in a folder on this computer. Characters, settings and the conversation live in this browser.</p>
      {!info ? (
        <div className="note small">The desktop server isn't running, so the library can't be reached.</div>
      ) : (
        <>
          <div className="field">
            <span>Library folder</span>
            <input className="input mono" value={target} onChange={(e) => setTarget(e.target.value)} disabled={info.fromEnv} />
            {info.fromEnv ? <span className="small">Set by the PDD_DATA environment variable.</span> : null}
          </div>
          <label className="check">
            <input type="checkbox" checked={move} onChange={(e) => setMove(e.target.checked)} />
            <span>Copy the current library there</span>
          </label>
          <button className="btn primary" disabled={info.fromEnv || !target.trim() || target === info.dataDir} onClick={() => void apply()}>
            Use this folder
          </button>
          {note ? <div className="note small" style={{ marginTop: 10 }}>{note}</div> : null}
        </>
      )}
    </>
  );
}

/** Set (or change) the backup passphrase: typed twice, checked, kept in Keys. */
function BackupPassphrase({ name, need }: { name: string; need: string }) {
  const saved = useDesk((s) => Boolean(s.env[name]));
  const [editing, setEditing] = useState(!saved);
  const [one, setOne] = useState("");
  const [two, setTwo] = useState("");
  const [show, setShow] = useState(false);
  const words = one.trim().split(/\s+/).filter(Boolean).length;
  const strong = one.length >= 16 || (one.length >= 12 && /[a-z]/i.test(one) && /\d|[^\w\s]/.test(one)) || words >= 4;
  const problem = !one ? "" : one.length < 10 ? "Use at least 10 characters (four ordinary words work well)." : two && one !== two ? "The two don't match." : "";
  const save = () => {
    desk().set({ env: { ...desk().env, [name]: one } });
    setOne("");
    setTwo("");
    setEditing(false);
    desk().say("Passphrase saved.");
  };
  return (
    <div className="note small" style={{ margin: "8px 0 12px" }}>
      <b>Backup passphrase</b> <span className="muted">({need})</span>
      <p style={{ margin: "4px 0 8px" }}>
        The backup is locked with this before it leaves this computer. To restore it, on this computer or a new one, you'll type the same passphrase. Nobody can recover it for you,
        so write it down somewhere safe.
      </p>
      {!editing && saved ? (
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <span style={{ color: "var(--good)" }}>A passphrase is saved.</span>
          <button className="btn small" onClick={() => setEditing(true)}>
            Change it…
          </button>
        </div>
      ) : (
        <>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <input className="input" type={show ? "text" : "password"} autoComplete="new-password" placeholder="Passphrase" value={one} onChange={(e) => setOne(e.target.value)} aria-label="Passphrase" />
            <input className="input" type={show ? "text" : "password"} autoComplete="new-password" placeholder="Type it again" value={two} onChange={(e) => setTwo(e.target.value)} aria-label="Type the passphrase again" />
            <label className="check" style={{ padding: 0 }}>
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
              <span>Show</span>
            </label>
          </div>
          <div style={{ marginTop: 6, minHeight: 18 }}>
            {problem ? <span style={{ color: "var(--warn)" }}>{problem}</span> : one && two ? <span style={{ color: strong ? "var(--good)" : "var(--warn)" }}>{strong ? "Matches, and it's a strong one." : "Matches. A longer one would be safer."}</span> : null}
          </div>
          <div className="row" style={{ gap: 6, marginTop: 4 }}>
            <button className="btn primary small" disabled={!one || one !== two || one.length < 10} onClick={save}>
              Save passphrase
            </button>
            {saved ? (
              <button className="btn small" onClick={() => (setEditing(false), setOne(""), setTwo(""))}>
                Cancel
              </button>
            ) : null}
            <span className="faint">Kept in Keys as {name}{saved ? "; changing it doesn't re-lock older backups, which keep the passphrase they were made with." : "."}</span>
          </div>
        </>
      )}
    </div>
  );
}

function ServerBackup() {
  const s = useDesk();
  const b = s.backup;
  const [note, setNote] = useState("");
  const [list, setList] = useState<RemoteBackup[] | null>(null);
  const [ask, setAsk] = useState<string | null>(null);
  const [restorePass, setRestorePass] = useState("");
  const set = (p: Partial<typeof b>) => desk().set({ backup: { ...desk().backup, ...p } });
  const run = async (fn: () => Promise<string>) => {
    setNote("Working…");
    try {
      setNote(await fn());
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
  };
  const ok = allowed(s.privacy, "backup");
  return (
    <>
      <div className="divider" />
      <h4>
        Backups to your own server <Sensitive />
      </h4>
      <p className="small muted">
        Works with the backup server from Jade Vault (<span className="mono">jade-backup-server.py</span>): run it on a machine that's always on and paste its address and token here. Encrypted backups are locked here with your passphrase before they leave; there's no way back in if the passphrase is lost.
      </p>
      {!ok ? (
        <div className="note small" style={{ marginBottom: 10 }}>
          Backups to a server are off until you allow them in Privacy.{" "}
          <button className="btn small" onClick={() => openSettingsSection("privacy")}>
            Privacy
          </button>
        </div>
      ) : null}
      <label className="field">
        <span>Server address</span>
        <input className="input mono" value={b.url} placeholder="http://192.168.1.20:8787" onChange={(e) => set({ url: e.target.value.trim() })} />
      </label>
      <label className="field">
        <span>Server token: the name of the key in Keys</span>
        <input className="input mono" value={b.keyName} onChange={(e) => set({ keyName: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })} />
        <span className="small">{s.env[b.keyName] ? <span style={{ color: "var(--good)" }}>Set in Keys.</span> : <span style={{ color: "var(--warn)" }}>Not set yet (Keys).</span>}</span>
      </label>
      <label className="field">
        <span>What to back up</span>
        <Seg
          value={b.what}
          options={[
            { id: "full", label: "Everything: characters, files, chats, settings" },
            { id: "config", label: "Settings and persona files only" },
          ]}
          onChange={(what) => set({ what })}
        />
      </label>
      <label className="check">
        <input type="checkbox" checked={b.encrypt || b.includeKeys} disabled={b.includeKeys} onChange={(e) => set({ encrypt: e.target.checked })} />
        <span>Encrypt on this computer before sending (the server never sees the contents)</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={b.includeKeys} onChange={(e) => set({ includeKeys: e.target.checked })} />
        <span>Include keys and SSH passwords (forces encryption)</span>
      </label>
      {b.encrypt || b.includeKeys ? <BackupPassphrase name={b.passName || "BACKUP_PASSPHRASE"} need={b.includeKeys ? "needed: these backups include your keys" : "needed for encrypted backups"} /> : null}
      <label className="check">
        <input type="checkbox" checked={b.on} onChange={(e) => set({ on: e.target.checked })} />
        <span>Back up on a schedule, while the desktop is open</span>
      </label>
      {b.on ? (
        <label className="field">
          <span>Every (hours)</span>
          <Num min={1} max={168} value={b.everyHours} onChange={(everyHours) => set({ everyHours })} />
        </label>
      ) : null}
      <p className="small muted">
        {b.last ? `Last backup: ${new Date(b.last).toLocaleString()}.` : "No backup yet."} {b.lastError ? `Last problem: ${b.lastError}` : ""}
      </p>
      <div className="row">
        <button className="btn" disabled={!ok || !b.url} onClick={() => void run(testServer)}>
          Test
        </button>
        <button
          className="btn primary"
          disabled={!ok || !b.url || ((b.encrypt || b.includeKeys) && !s.env[b.passName || "BACKUP_PASSPHRASE"])}
          data-tip={(b.encrypt || b.includeKeys) && !s.env[b.passName || "BACKUP_PASSPHRASE"] ? "Save a passphrase first" : undefined}
          onClick={() => void run(() => backupNow())}
        >
          Back up now
        </button>
        <button
          className="btn"
          disabled={!ok || !b.url}
          onClick={() =>
            void run(async () => {
              const l = await listBackups();
              setList(l);
              return `${l.length} desktop backup${l.length === 1 ? "" : "s"} on the server.`;
            })
          }
        >
          Show backups
        </button>
      </div>
      {note ? <div className="note small" style={{ marginTop: 8 }}>{note}</div> : null}
      {list?.length ? (
        <div style={{ marginTop: 8 }}>
          {list.map((x) => (
            <div key={x.name} className="kv" style={{ gridTemplateColumns: "1fr auto auto" }}>
              <span className="mono small">{x.name}</span>
              <span className="small muted">{Math.round(x.size / 1024)} KB</span>
              <button className="btn small" onClick={() => setAsk(x.name)}>
                Restore…
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {ask ? (
        <Confirm
          title="Restore this backup?"
          body={
            <>
              <p>It replaces characters, files, chats and settings on this desktop with what's in {ask}. Save everything first if you might want today's state back.</p>
              {/-enc\.json$/.test(ask) ? (
                <label className="field">
                  <span>{s.env[b.passName || "BACKUP_PASSPHRASE"] ? "Passphrase (leave empty to use the one saved here)" : "The passphrase this backup was made with"}</span>
                  <input className="input" type="password" autoComplete="current-password" value={restorePass} onChange={(e) => setRestorePass(e.target.value)} />
                </label>
              ) : null}
            </>
          }
          yes="Restore"
          danger
          onYes={() => void run(() => restore(ask, restorePass)).finally(() => setRestorePass(""))}
          onClose={() => (setAsk(null), setRestorePass(""))}
        />
      ) : null}
    </>
  );
}

function openSettingsSection(section: string) {
  sessionStorage.setItem("pdd-settings-section", section);
  window.dispatchEvent(new CustomEvent("pdd-settings", { detail: section }));
}
