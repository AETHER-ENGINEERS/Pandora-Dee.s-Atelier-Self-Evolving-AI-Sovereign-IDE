import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { desk, useDesk } from "../lib/store.ts";
import { comfyInfo, engineAllowed, newEngineId } from "../lib/media.ts";
import { outbound } from "../lib/outbound.ts";
import type { ImageEngine, ImageKind, SongEngine, SongKind } from "../lib/mediaPrefs.ts";

/** Setting up the servers that make pictures or songs (usually on another computer on your network). */

const IMAGE_KINDS: { kind: ImageKind; label: string; url: string; help: string }[] = [
  { kind: "comfyui", label: "ComfyUI", url: "http://macbook.local:8188", help: "Uses its first checkpoint with a basic workflow, or your own workflow below." },
  { kind: "a1111", label: "Draw Things / Automatic1111 / Forge", url: "http://macbook.local:7860", help: "Draw Things: Settings → API Server → HTTP, on. Automatic1111/Forge: start with --api --listen." },
  { kind: "openai", label: "OpenAI-style image API", url: "https://api.openai.com/v1", help: "Any service with /images/generations (OpenAI, LocalAI and others). Needs a key in Keys." },
];
const SONG_KINDS: { kind: SongKind; label: string; url: string; help: string }[] = [
  { kind: "mlx-serve", label: "mlx-serve (MLX Core)", url: "http://127.0.0.1:11234", help: "On the Mac: MLX Core.app, or `mlx-serve --serve`. Put the model's name below (MiniMax-Music3-MLX-Serve-8bit, or the ACE-Step 1.5 XL Turbo build). MiniMax Music 3 needs lyrics; its weights have their own community licence." },
  { kind: "acestep", label: "ACE-Step 1.5", url: "http://macbook.local:8001", help: "Start its API on the other computer with: uv run acestep-api --host 0.0.0.0 (runs on Macs, and on 4–8 GB graphics cards)." },
  { kind: "yue2-comfyui", label: "YuE2 (in ComfyUI)", url: "http://pc.local:8188", help: "ComfyUI with the YuE2 nodes and yue2_3b_int8_convrot.safetensors in models/checkpoints. Wants an NVIDIA card with lots of memory. Its songs are for non-commercial use (CC-BY-NC-4.0)." },
];

type Any = ImageEngine | SongEngine;

export function EnginesDialog({ type, onClose }: { type: "images" | "songs"; onClose: () => void }) {
  const media = useDesk((s) => s.media);
  const list: Any[] = media[type];
  const kinds = type === "images" ? IMAGE_KINDS : SONG_KINDS;
  const [test, setTest] = useState<Record<string, string>>({});
  const save = (next: Any[]) => desk().set({ media: { ...desk().media, [type]: next } });
  const edit = (id: string, p: Partial<Any>) => save(list.map((e) => (e.id === id ? ({ ...e, ...p } as Any) : e)));
  const add = (k: (typeof kinds)[number]) => save([...list, { id: newEngineId(), name: k.label, kind: k.kind, url: k.url, enabled: true } as Any]);

  const check = async (e: Any) => {
    setTest((t) => ({ ...t, [e.id]: "Checking…" }));
    try {
      const why = engineAllowed(e.url);
      if (why) throw new Error(why);
      let msg = "";
      if (e.kind === "comfyui" || e.kind === "yue2-comfyui") {
        const info = await comfyInfo(e);
        msg = e.kind === "yue2-comfyui"
          ? info.yue2 ? `Ready: YuE2 nodes found${info.checkpoints.some((c) => /yue2/i.test(c)) ? " and the YuE2 checkpoint" : ", but no YuE2 checkpoint in models/checkpoints yet"}.` : "ComfyUI answers, but it has no YuE2 nodes. Update ComfyUI."
          : `Ready: ${info.checkpoints.length} checkpoint${info.checkpoints.length === 1 ? "" : "s"}${info.checkpoints.length ? ` (${info.checkpoints.slice(0, 3).join(", ")}${info.checkpoints.length > 3 ? "…" : ""})` : ""}.`;
      } else {
        const path = e.kind === "a1111" ? "/sdapi/v1/options" : e.kind === "acestep" ? "/health" : e.kind === "mlx-serve" ? "/v1/models" : "/models";
        const key = e.keyName ? desk().env[e.keyName] ?? "" : "";
        const r = await outbound(`${e.url.replace(/\/+$/, "")}${path}`, { headers: key ? { Authorization: `Bearer ${key}` } : {}, timeout: 20 }, e.via ?? desk().net.via);
        msg = r.ok ? "Ready: it answers." : `It answered ${r.status}.`;
        if (r.ok && e.kind === "mlx-serve") {
          const ids = (((await r.json().catch(() => ({}))) as { data?: { id: string }[] }).data ?? []).map((m) => m.id);
          const music = ids.filter((id) => /music|ace-?step|song/i.test(id));
          msg = music.length ? `Ready. Music models: ${music.join(", ")}` : `It answers${ids.length ? ` (${ids.length} models)` : ""}, but lists no music model; download one in MLX Core's Music tab, or type its name.`;
        }
      }
      setTest((t) => ({ ...t, [e.id]: msg }));
    } catch (err) {
      setTest((t) => ({ ...t, [e.id]: err instanceof Error ? err.message : String(err) }));
    }
  };

  return (
    <div className="scrim" onPointerDown={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div className="dialog engines" role="dialog" aria-modal="true" aria-label={type === "images" ? "Picture engines" : "Song engines"}>
        <h2>{type === "images" ? "Picture engines" : "Song engines"}</h2>
        <p className="small muted">
          The servers that do the work. They usually run on another computer on your network (the Mac with the models); the
          desktop reaches them through its relay. Ones on another computer need “Models on your network” turned on in
          Settings → Privacy.
        </p>
        {list.map((e) => {
          const k = kinds.find((x) => x.kind === e.kind);
          return (
            <div key={e.id} className="engine">
              <div className="row">
                <label className="check" style={{ padding: 0 }}>
                  <input type="checkbox" checked={e.enabled} onChange={(ev) => edit(e.id, { enabled: ev.target.checked })} />
                  <span>On</span>
                </label>
                <input className="input grow" value={e.name} onChange={(ev) => edit(e.id, { name: ev.target.value })} aria-label="Name" />
                <span className="pill small">{k?.label}</span>
                <button className="icon-btn" data-tip="Remove" aria-label={`Remove ${e.name}`} onClick={() => save(list.filter((x) => x.id !== e.id))}>
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="row">
                <input className="input grow mono" value={e.url} onChange={(ev) => edit(e.id, { url: ev.target.value })} aria-label="Address" placeholder={k?.url} />
                <input className="input mono" style={{ width: 160 }} value={e.keyName ?? ""} onChange={(ev) => edit(e.id, { keyName: ev.target.value.trim() || undefined })} aria-label="Key name in Keys" placeholder="Key name (if any)" />
              </div>
              {e.kind !== "yue2-comfyui" ? (
                <div className="row">
                  <input className="input grow mono" value={e.model ?? ""} onChange={(ev) => edit(e.id, { model: ev.target.value.trim() || undefined })} aria-label="Model" placeholder={e.kind === "comfyui" ? "Checkpoint (blank: its first)" : e.kind === "openai" ? "Model (blank: gpt-image-1)" : e.kind === "acestep" ? "Model (blank: its default)" : e.kind === "mlx-serve" ? "Music model, e.g. MiniMax-Music3-MLX-Serve-8bit" : "Model (blank: the one loaded)"} />
                  {"steps" in e || e.kind === "comfyui" || e.kind === "a1111" ? (
                    <input className="input" type="number" min={1} max={150} style={{ width: 90 }} value={(e as ImageEngine).steps ?? 20} onChange={(ev) => edit(e.id, { steps: Number(ev.target.value) || 20 } as Partial<ImageEngine>)} aria-label="Steps" data-tip="Steps" />
                  ) : null}
                </div>
              ) : null}
              {e.kind === "comfyui" ? (
                <details>
                  <summary className="small">Your own workflow (optional)</summary>
                  <textarea
                    className="input mono small"
                    rows={5}
                    value={(e as ImageEngine).workflow ?? ""}
                    onChange={(ev) => edit(e.id, { workflow: ev.target.value } as Partial<ImageEngine>)}
                    placeholder='Paste a workflow saved with “Export (API)”, with {{prompt}}, {{negative}}, {{seed}}, {{width}}, {{height}}, {{steps}} where those go, e.g. "text": "{{prompt}}"'
                    aria-label="Workflow"
                  />
                </details>
              ) : null}
              <div className="row">
                <button className="btn small" onClick={() => void check(e)}>
                  Test
                </button>
                <span className="small muted grow">{test[e.id] ?? k?.help}</span>
              </div>
            </div>
          );
        })}
        <div className="row" style={{ flexWrap: "wrap" }}>
          {kinds.map((k) => (
            <button key={k.kind} className="btn small" onClick={() => add(k)}>
              <Plus size={13} /> {k.label}
            </button>
          ))}
        </div>
        <label className="check small">
          <input type="checkbox" checked={media.characterTools} onChange={(ev) => desk().set({ media: { ...desk().media, characterTools: ev.target.checked } })} />
          <span>
            Characters may make pictures and songs themselves (the make_picture and make_song tools), when you ask. Each picture or
            song takes the engine's time, so this starts off.
          </span>
        </label>
        <div className="actions">
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
