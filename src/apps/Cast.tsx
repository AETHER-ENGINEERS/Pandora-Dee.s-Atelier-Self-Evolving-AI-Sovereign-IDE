import { Num } from "../ui/Num.tsx";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, FolderOpen, LogIn, LogOut, Plus, Trash2, Upload } from "lucide-react";
import { desk, useDesk, type CharPrefs } from "../lib/store.ts";
import { credential, explainError, listModels } from "../lib/model.ts";
import { speak, voiceList } from "../lib/voice.ts";
import { voiceFor } from "../lib/prefs.ts";
import { openMenu } from "../ui/ContextMenu.tsx";
import { characterMenu } from "../ui/menus.ts";

import { blankCharacter, type Character, type Look } from "../lib/characters.ts";
import { download, makeBackup } from "../lib/backup.ts";
import { shrinkPicture } from "../lib/secure.ts";
import { MAX_IN_ROOM } from "../lib/room.ts";
import { CharAvatar, Confirm, Seg } from "../ui/common.tsx";
import { loadBackupFile } from "../ui/Desktop.tsx";
import { useWidth } from "../ui/hooks.ts";
import { Face } from "./Presence.tsx";

export function CastApp() {
  const s = useDesk();
  const [ref, width] = useWidth<HTMLDivElement>();
  const [view, setView] = useState<string | null>(() => {
    const asked = sessionStorage.getItem("pdd-cast-view");
    sessionStorage.removeItem("pdd-cast-view");
    return asked;
  });
  useEffect(() => {
    const on = (e: Event) => setView((e as CustomEvent<string>).detail);
    window.addEventListener("pdd-cast", on);
    return () => window.removeEventListener("pdd-cast", on);
  }, []);
  const fileRef = useRef<HTMLInputElement>(null);
  const all = s.visibleCharacters();
  const shown = view === "new" ? null : all.find((c) => c.id === view);

  return (
    <div ref={ref} className={width < 420 ? "cast-narrow" : ""} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {view === "new" ? (
        <NewCharacter onDone={(id) => setView(id)} />
      ) : shown ? (
        <Profile c={shown} onBack={() => setView(null)} />
      ) : (
        <>
          <div className="toolbar">
            <span className="small muted grow">
              {s.members.length}/{MAX_IN_ROOM} in the room
            </span>
            <button className="icon-btn" data-tip="Create a character" aria-label="Create a character" onClick={() => setView("new")}>
              <Plus size={16} />
            </button>
            <button className="icon-btn" data-tip="Load a backup (.json)" aria-label="Load a backup" onClick={() => fileRef.current?.click()}>
              <Upload size={16} />
            </button>
          </div>
          <div className="scroll grow">
            <div className="cast-list">
              {all.map((c) => {
                const inRoom = s.members.includes(c.id);
                return (
                  <div
                    key={c.id}
                    className={`cast-card${inRoom ? " in" : ""}`}
                    style={{ ["--c" as string]: c.accent }}
                    onClick={() => setView(c.id)}
                    onContextMenu={(e) => openMenu(e, characterMenu(c.id))}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="pic">
                      {c.art.portrait || c.art.still ? <img src={c.art.still || c.art.portrait} alt="" /> : <CharAvatar c={c} size={54} />}
                    </div>
                    <div className="meta grow">
                      <b>{c.short === c.name ? c.name : c.short}</b>
                      <span className="small muted tl">{c.tagline}</span>
                      <div className="traits">
                        {c.traits.slice(0, 3).map((t) => (
                          <span key={t}>{t}</span>
                        ))}
                      </div>
                    </div>
                    <button
                      className="btn small badge"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (inRoom) desk().leave(c.id);
                        else {
                          const err = desk().join(c.id);
                          if (err) desk().say(err);
                        }
                      }}
                      data-tip={inRoom ? "Ask to step out" : "Invite to the room"}
                    >
                      {inRoom ? "In the room" : "Invite"}
                    </button>
                  </div>
                );
              })}
            </div>
            {!s.adultOpen && s.allCharacters().some((c) => c.shelf === "adult") ? <p className="small faint" style={{ padding: "0 12px" }}>Some characters are on the adult shelf (Settings → Adult shelf).</p> : null}
          </div>
        </>
      )}
      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && loadBackupFile(e.target.files[0])} />
    </div>
  );
}

function Profile({ c, onBack }: { c: Character; onBack: () => void }) {
  const s = useDesk();
  const [ask, setAsk] = useState(false);
  const inRoom = s.members.includes(c.id);
  const pref = s.charPrefs[c.id] ?? { look: "talking" as Look };
  const files = s.filesOf(c.id);
  const journalCount = Object.keys(files).filter((p) => p.startsWith("journal/") && !p.endsWith("README.md")).length;
  const memoryLines = (files["MEMORY.md"] ?? "").split("\n").filter((l) => l.startsWith("- ")).length;
  const picRef = useRef<HTMLInputElement>(null);

  return (
    <div className="scroll grow" style={{ ["--c" as string]: c.accent }}>
      <div className="toolbar">
        <button className="btn small ghost" onClick={onBack}>
          <ArrowLeft size={14} /> Everyone
        </button>
      </div>
      <div className="profile">
        <div className="pic" style={{ position: "relative" }}>
          <Face c={c} look={pref.look} mouth={0} speaking={false} />
        </div>
        <div>
          <h2 style={{ color: c.accent }}>{c.name}</h2>
          <p className="muted">{c.tagline}</p>
          <div className="traits" style={{ marginBottom: 10 }}>
            {c.traits.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
          <p>“{c.greeting}”</p>
          <p className="small muted">
            {Object.keys(files).length} files · {journalCount} journal day{journalCount === 1 ? "" : "s"} · {memoryLines} memories
          </p>
          <div className="row" style={{ marginBottom: 12 }}>
            {inRoom ? (
              <button className="btn" onClick={() => desk().leave(c.id)}>
                <LogOut size={14} /> Step out
              </button>
            ) : (
              <button
                className="btn primary"
                onClick={() => {
                  const err = desk().join(c.id);
                  if (err) desk().say(err);
                }}
              >
                <LogIn size={14} /> Invite to the room
              </button>
            )}
            <button
              className="btn"
              onClick={() => {
                sessionStorage.setItem("pdd-files-char", c.id);
                window.dispatchEvent(new CustomEvent("pdd-files", { detail: { char: c.id } }));
                desk().openApp("files");
              }}
            >
              <FolderOpen size={14} /> Files
            </button>
            <button className="btn" onClick={() => download(`${c.id}-backup.json`, makeBackup(c, files))}>
              <Download size={14} /> Save backup
            </button>
          </div>
        </div>
      </div>
      <div style={{ padding: "0 14px 20px" }}>
        <div className="field">
          <span>Look in the Presence window</span>
          <Seg<Look>
            value={pref.look}
            options={[
              { id: "talking", label: "Talking" },
              { id: "chibi", label: "Chibi" },
              { id: "photo", label: "Photo" },
            ]}
            onChange={(look) => desk().setCharPrefs(c.id, { look })}
          />
        </div>
        <CharAI c={c} />
        <CharVoice c={c} />
        {!c.builtIn ? (
          <>
            <div className="divider" />
            <h4>Edit</h4>
            <div className="field">
              <span>Name</span>
              <input className="input" value={c.name} onChange={(e) => desk().updateCharacter(c.id, { name: e.target.value })} />
            </div>
            <div className="row">
              <label className="field grow">
                <span>Short name</span>
                <input className="input" value={c.short} onChange={(e) => desk().updateCharacter(c.id, { short: e.target.value })} />
              </label>
              <label className="field">
                <span>Colour</span>
                <input type="color" value={c.accent} onChange={(e) => desk().updateCharacter(c.id, { accent: e.target.value })} style={{ height: 36, width: 60, background: "none", border: 0 }} />
              </label>
            </div>
            <div className="field">
              <span>One line about them</span>
              <input className="input" value={c.tagline} onChange={(e) => desk().updateCharacter(c.id, { tagline: e.target.value })} />
            </div>
            <div className="field">
              <span>Traits (comma separated)</span>
              <input className="input" value={c.traits.join(", ")} onChange={(e) => desk().updateCharacter(c.id, { traits: e.target.value.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 5) })} />
            </div>
            <div className="row">
              <button className="btn" onClick={() => picRef.current?.click()}>
                Picture from this device…
              </button>
              <button className="btn danger" onClick={() => setAsk(true)}>
                <Trash2 size={14} /> Remove {c.short}
              </button>
            </div>
            <p className="small faint" style={{ marginTop: 8 }}>
              Who they are lives in their SOUL.md. Open Files to edit it.
            </p>
            <input
              ref={picRef}
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const pic = await shrinkPicture(f, 512);
                  desk().updateCharacter(c.id, { art: { ...c.art, portrait: pic } });
                } catch (err) {
                  desk().say(err instanceof Error ? err.message : String(err));
                }
              }}
            />
          </>
        ) : null}
      </div>
      {ask ? (
        <Confirm
          title={`Remove ${c.name}?`}
          body={<p>Their files, journal and memory on this desktop will be deleted. Save a backup first if you might want them back.</p>}
          yes="Remove"
          danger
          onYes={() => {
            desk().removeCharacter(c.id);
            onBack();
          }}
          onClose={() => setAsk(false)}
        />
      ) : null}
    </div>
  );
}

function NewCharacter({ onDone }: { onDone: (id: string) => void }) {
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [soul, setSoul] = useState("");
  const [accent, setAccent] = useState("#9aa4ff");
  const [picture, setPicture] = useState("");
  const [adult, setAdult] = useState(false);
  const adultOpen = useDesk((s) => s.adultOpen);
  const create = () => {
    const c = blankCharacter(name.trim());
    const taken = desk().allCharacters().map((x) => x.id);
    let id = c.id;
    for (let n = 2; taken.includes(id); n++) id = `${c.id}-${n}`;
    const made: Character = {
      ...c,
      id,
      tagline,
      accent,
      art: { portrait: picture },
      shelf: adult ? "adult" : undefined,
      files: { ...c.files, "SOUL.md": `# ${name.trim()}\n\n${soul.trim() || "Who I am, how I talk, and what I care about."}\n` },
    };
    desk().addCharacter(made);
    const err = desk().join(id);
    if (err) desk().say(err);
    onDone(id);
  };
  return (
    <div className="scroll grow" style={{ padding: 16 }}>
      <h2>New character</h2>
      <p className="muted small">They get their own files, journal and memory. You can change everything later.</p>
      <label className="field">
        <span>Name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <label className="field">
        <span>One line about them</span>
        <input className="input" value={tagline} onChange={(e) => setTagline(e.target.value)} />
      </label>
      <label className="field">
        <span>Who are they? How do they talk? What do they care about?</span>
        <textarea className="textarea" rows={7} value={soul} onChange={(e) => setSoul(e.target.value)} placeholder="Written in their own voice works best: “I’m…”" />
      </label>
      <div className="row" style={{ marginBottom: 12 }}>
        <label className="row">
          <span className="small muted">Colour</span>
          <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} style={{ height: 32, width: 50, background: "none", border: 0 }} />
        </label>
        <label className="btn">
          {picture ? "Change picture" : "Picture from this device…"}
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setPicture(await shrinkPicture(f, 512).catch(() => ""));
            }}
          />
        </label>
        {picture ? <img src={picture} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover" }} /> : null}
      </div>
      {adultOpen ? (
        <label className="check">
          <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
          <span>Keep them on the adult shelf</span>
        </label>
      ) : null}
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" onClick={() => onDone("")}>
          Cancel
        </button>
        <button className="btn primary" disabled={!name.trim()} onClick={create}>
          Create and invite
        </button>
      </div>
    </div>
  );
}

/** Shows "Same as everyone" with the shared value, or the character's own. */
function Own({ label, own, shared, children, onReset }: { label: string; own: boolean; shared: string; children: React.ReactNode; onReset: () => void }) {
  return (
    <div className="field">
      <span className="row" style={{ justifyContent: "space-between" }}>
        <span>{label}</span>
        {own ? (
          <button className="btn small ghost" onClick={onReset}>
            Use everyone's ({shared})
          </button>
        ) : (
          <span className="faint small">Same as everyone: {shared}</span>
        )}
      </span>
      {children}
    </div>
  );
}

function CharAI({ c }: { c: Character }) {
  const s = useDesk();
  const p = s.charPrefs[c.id] ?? { look: "talking" as Look };
  const conns = s.model.connections.filter((x) => x.enabled);
  const conn = conns.find((x) => x.id === p.connection);
  const [models, setModels] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const set = (patch: Partial<CharPrefs>) => desk().setCharPrefs(c.id, patch);
  const unset = (key: keyof CharPrefs) => {
    const next = { ...desk().charPrefs[c.id] } as CharPrefs;
    delete next[key];
    desk().set({ charPrefs: { ...desk().charPrefs, [c.id]: next } });
  };
  const list = async () => {
    if (!conn) return;
    setNote("Checking…");
    try {
      const m = await listModels(conn, credential(conn, desk().env));
      setModels(m);
      setNote(m.length ? "" : "That connection has no models.");
    } catch (e) {
      setNote(explainError(e, conn));
    }
  };
  return (
    <>
      <div className="divider" />
      <h4>{c.short}'s AI</h4>
      <div className="field">
        <span>Connection</span>
        <select className="select" value={p.connection ?? ""} onChange={(e) => (set({ connection: e.target.value || undefined, model: undefined }), setModels([]))}>
          <option value="">Same as everyone (tried in order, Settings → AI)</option>
          {conns.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </div>
      {conn ? (
        <div className="field">
          <span>Model</span>
          <div className="row">
            {models.length ? (
              <select className="select grow" value={p.model ?? ""} onChange={(e) => set({ model: e.target.value || undefined })}>
                <option value="">That connection's model ({conn.model || "picks automatically"})</option>
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <input className="input grow mono" value={p.model ?? ""} placeholder={conn.model || "e.g. qwen3:8b"} onChange={(e) => set({ model: e.target.value || undefined })} />
            )}
            <button className="btn small" onClick={() => void list()}>
              List models
            </button>
          </div>
          {note ? <span className="small">{note}</span> : null}
        </div>
      ) : null}
      <Own label="Creativity" own={p.temperature !== undefined} shared={s.model.temperature.toFixed(2)} onReset={() => unset("temperature")}>
        <Num min={0} max={1.5} step={0.05} value={p.temperature ?? s.model.temperature} onChange={(n) => set({ temperature: n })} />
      </Own>
      <Own label="How much they say" own={p.length !== undefined} shared="normal" onReset={() => unset("length")}>
        <Seg
          value={p.length ?? "normal"}
          options={[
            { id: "short", label: "Short" },
            { id: "normal", label: "Normal" },
            { id: "long", label: "Full answers" },
          ]}
          onChange={(length) => set({ length })}
        />
      </Own>
      <Own label="Tools" own={p.tools !== undefined} shared={s.model.tools ? "on" : "off"} onReset={() => unset("tools")}>
        <label className="check" style={{ padding: 0 }}>
          <input type="checkbox" checked={p.tools ?? s.model.tools} onChange={(e) => set({ tools: e.target.checked })} />
          <span>{c.short} can use tools (files, memory, journal, games, web when allowed, MCP)</span>
        </label>
      </Own>
      {(p.tools ?? s.model.tools) ? (
        <Own label="Most tool steps in one reply" own={p.maxSteps !== undefined} shared={String(s.model.maxSteps)} onReset={() => unset("maxSteps")}>
          <Num min={1} max={100} typedMax={100000} value={p.maxSteps ?? s.model.maxSteps} onChange={(n) => set({ maxSteps: n })} />
        </Own>
      ) : null}
    </>
  );
}

function CharVoice({ c }: { c: Character }) {
  const s = useDesk();
  const own = s.charPrefs[c.id]?.voice ?? {};
  const [voices, setVoices] = useState(voiceList());
  useEffect(() => {
    const on = () => setVoices(voiceList());
    window.speechSynthesis?.addEventListener?.("voiceschanged", on);
    return () => window.speechSynthesis?.removeEventListener?.("voiceschanged", on);
  }, []);
  const set = (patch: Partial<NonNullable<CharPrefs["voice"]>>) => desk().setCharPrefs(c.id, { voice: { ...desk().charPrefs[c.id]?.voice, ...patch } });
  const unset = (key: keyof NonNullable<CharPrefs["voice"]>) => {
    const next = { ...own };
    delete next[key];
    desk().setCharPrefs(c.id, { voice: next });
  };
  const sharedPitch = Math.round((s.voice.pitch + c.pitch) * 100) / 100;
  return (
    <>
      <div className="divider" />
      <h4>{c.short}'s voice</h4>
      <label className="check">
        <input type="checkbox" checked={own.on !== false} onChange={(e) => (e.target.checked ? unset("on") : set({ on: false }))} />
        <span>
          {c.short} speaks aloud{!s.voice.on ? " (voice is off for everyone right now: Settings → Voice)" : ""}
        </span>
      </label>
      <Own label="Voice" own={Boolean(own.voiceName)} shared={s.voice.voiceName || "automatic"} onReset={() => unset("voiceName")}>
        <select className="select" value={own.voiceName ?? ""} onChange={(e) => (e.target.value ? set({ voiceName: e.target.value }) : unset("voiceName"))}>
          <option value="">Same as everyone</option>
          {voices.map((v) => (
            <option key={`${v.name}-${v.lang}`} value={v.name}>
              {v.name} · {v.lang}
            </option>
          ))}
        </select>
      </Own>
      <Own label="Volume, as a share of the voice volume" own={own.volume !== undefined} shared="100%" onReset={() => unset("volume")}>
        <Num min={0} max={1.5} step={0.05} value={own.volume ?? 1} onChange={(n) => set({ volume: n })} percent />
      </Own>
      <Own label="Speed" own={own.rate !== undefined} shared={s.voice.rate.toFixed(2)} onReset={() => unset("rate")}>
        <Num min={0.6} max={1.6} step={0.05} value={own.rate ?? s.voice.rate} onChange={(n) => set({ rate: n })} />
      </Own>
      <Own label="Pitch" own={own.pitch !== undefined} shared={sharedPitch.toFixed(2)} onReset={() => unset("pitch")}>
        <Num min={0.3} max={2} step={0.05} value={own.pitch ?? sharedPitch} onChange={(n) => set({ pitch: n })} />
      </Own>
      <button
        className="btn small"
        onClick={() => {
          const v = voiceFor(c.id);
          speak(c.id, c.greeting, { ...v.prefs, on: true }, v.shift);
        }}
      >
        Hear {c.short}
      </button>
    </>
  );
}
