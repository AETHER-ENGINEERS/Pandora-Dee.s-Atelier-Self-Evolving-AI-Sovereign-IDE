import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { desk, useDesk } from "../lib/store.ts";
import { outbound } from "../lib/outbound.ts";
import { withMacAddress } from "../lib/mac.ts";
import { AddressField, askAddress } from "./AddressField.tsx";
import { scopeOf } from "../lib/model.ts";
import { allowed, blockedBecause } from "../lib/privacy.ts";
import { defaultSpeechModel, engineUrl, isOpenAI, OPENAI_VOICES, type VoiceEngine } from "../lib/voiceEngines.ts";

/** Voice engines in Settings → Voice: the servers that speak and listen (usually on another computer). */

const PRESETS: { label: string; name: string; url: string; keyName?: string; model?: string }[] = [
  { label: "MLX Audio (Mac)", name: "MLX Audio", url: "http://macbook.local:15666", model: "mlx-community/Kokoro-82M-bf16" },
  { label: "OpenAI", name: "OpenAI voices", url: "https://api.openai.com/v1", keyName: "OPENAI_API_KEY", model: "gpt-4o-mini-tts" },
  { label: "Other (OpenAI-style)", name: "Voice server", url: "http://localhost:8880/v1" },
];

const newId = () => Math.random().toString(36).slice(2, 10);

function why(e: VoiceEngine): string {
  const scope = scopeOf(e.url);
  if (scope === "device") return "";
  const f = scope === "network" ? "network-models" : "online-models";
  return allowed(desk().privacy, f) ? "" : blockedBecause(desk().privacy, f);
}

async function get(e: VoiceEngine, url: string) {
  const block = why(e);
  if (block) throw new Error(block);
  const key = e.keyName ? desk().env[e.keyName] ?? "" : "";
  const r = await outbound(url, { headers: key ? { Authorization: `Bearer ${key}` } : {}, timeout: 30 }, e.via ?? desk().net.via);
  const text = await r.text();
  if (!r.ok) throw new Error(`It answered ${r.status}: ${text.slice(0, 160)}`);
  return JSON.parse(text) as Record<string, unknown>;
}

/** The voices an engine offers for its model (Kokoro lists ~50; OpenAI has a fixed set). */
export async function engineVoices(e: VoiceEngine): Promise<string[]> {
  if (isOpenAI(e.url)) return OPENAI_VOICES;
  const model = e.model || defaultSpeechModel(e.url);
  const j = await get(e, `${engineUrl(e.url, "voices")}?model=${encodeURIComponent(model)}`);
  return ((j.data as { id: string }[]) ?? []).map((v) => v.id);
}

export function EngineVoicePicker({ engineId, value, onChange }: { engineId: string; value: string; onChange: (v: string) => void }) {
  const e = useDesk((s) => s.voices.engines.find((x) => x.id === engineId));
  const [voices, setVoices] = useState<string[] | null>(null);
  const [note, setNote] = useState("");
  useEffect(() => {
    setVoices(null);
    setNote("");
    if (e) engineVoices(e).then(setVoices, (err) => (setVoices([]), setNote(err instanceof Error ? err.message : String(err))));
  }, [e?.id, e?.url, e?.model]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!e) return null;
  const list = voices ?? [];
  return (
    <>
      {list.length ? (
        <select className="select" value={list.includes(value) ? value : ""} onChange={(ev) => onChange(ev.target.value)} aria-label="Voice">
          <option value="">The model's own default</option>
          {list.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      ) : (
        <input className="input mono" value={value} onChange={(ev) => onChange(ev.target.value.trim())} placeholder={voices === null ? "Asking for its voices…" : "Voice name (or blank for the model's default)"} aria-label="Voice" />
      )}
      {note ? <span className="small faint">{note}</span> : null}
    </>
  );
}

export function VoiceEnginesEditor() {
  const engines = useDesk((s) => s.voices.engines);
  const [test, setTest] = useState<Record<string, string>>({});
  const save = (next: VoiceEngine[]) => desk().set({ voices: { ...desk().voices, engines: next } });
  const edit = (id: string, p: Partial<VoiceEngine>) => save(engines.map((e) => (e.id === id ? { ...e, ...p } : e)));
  const check = async (e: VoiceEngine) => {
    setTest((t) => ({ ...t, [e.id]: "Checking…" }));
    try {
      const voices = await engineVoices(e);
      setTest((t) => ({ ...t, [e.id]: voices.length ? `Ready: ${voices.length} voices for ${e.model || defaultSpeechModel(e.url)}.` : "It answers, but lists no voices for that model; the model's default voice is used." }));
    } catch (err) {
      setTest((t) => ({ ...t, [e.id]: err instanceof Error ? err.message : String(err) }));
    }
  };
  return (
    <div className="voice-engines">
      {engines.map((e) => (
        <div key={e.id} className="engine">
          <div className="row">
            <label className="check" style={{ padding: 0 }}>
              <input type="checkbox" checked={e.enabled} onChange={(ev) => edit(e.id, { enabled: ev.target.checked })} />
              <span>On</span>
            </label>
            <input className="input grow" value={e.name} onChange={(ev) => edit(e.id, { name: ev.target.value })} aria-label="Name" />
            <button className="icon-btn" aria-label={`Remove ${e.name}`} onClick={() => save(engines.filter((x) => x.id !== e.id))}>
              <Trash2 size={14} />
            </button>
          </div>
          <div className="row">
            <AddressField value={e.url} onChange={(url) => edit(e.id, { url })} />
            <label className="mini-field" style={{ width: 170 }}>
              <span>Key name (in Keys)</span>
              <input className="input mono" value={e.keyName ?? ""} onChange={(ev) => edit(e.id, { keyName: ev.target.value.trim() || undefined })} aria-label="Key name in Keys" placeholder="Key name (if any)" />
            </label>
          </div>
          <div className="row">
            <label className="mini-field grow">
              <span>Model</span>
              <input className="input mono" value={e.model ?? ""} onChange={(ev) => edit(e.id, { model: ev.target.value.trim() || undefined })} aria-label="Speaking model" placeholder={`Speaking model (blank: ${defaultSpeechModel(e.url)})`} />
            </label>
            <button className="btn small" onClick={() => void check(e)}>
              Test
            </button>
          </div>
          <label className="check small" style={{ padding: 0 }}>
            <input type="checkbox" checked={Boolean(e.clones)} onChange={(ev) => edit(e.id, { clones: ev.target.checked || undefined })} />
            <span>It clones voices: send each character's voice sample (Characters → their voice) with every line, as ref_audio and ref_text</span>
          </label>
          {test[e.id] ? <div className="small muted">{test[e.id]}</div> : null}
        </div>
      ))}
      <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
        {PRESETS.map((p) => (
          <button key={p.label} className="btn small" onClick={() =>
              void withMacAddress(p.url).then(async (guess) => {
                const url = await askAddress(p.name, guess);
                if (url) save([...desk().voices.engines, { id: newId(), name: p.name, url, keyName: p.keyName, model: p.model, enabled: true }]);
              })
            }>
            <Plus size={13} /> {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ListeningSettings() {
  const v = useDesk((s) => s.voices);
  const set = (p: Partial<typeof v.listen>) => desk().set({ voices: { ...desk().voices, listen: { ...desk().voices.listen, ...p } } });
  return (
    <>
      <label className="field">
        <span>Listening (talk instead of typing, with the 🎤 button)</span>
        <select className="select" value={v.listen.engine} onChange={(e) => set({ engine: e.target.value })}>
          <option value="">Off</option>
          {v.engines.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      {v.listen.engine ? (
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <input className="input mono grow" value={v.listen.model} onChange={(e) => set({ model: e.target.value.trim() })} aria-label="Listening model" placeholder="mlx-community/whisper-large-v3-turbo" />
          <input className="input" style={{ width: 160 }} value={v.listen.language} onChange={(e) => set({ language: e.target.value.trim() })} aria-label="Language" placeholder="Language (blank: any)" />
        </div>
      ) : null}
      <p className="small muted">
        What you say is recorded only while the button is on, sent to that engine to be written down, and put in the message box for you to
        check before sending. Phones and other computers need the desktop's https address for the microphone.
      </p>
    </>
  );
}
