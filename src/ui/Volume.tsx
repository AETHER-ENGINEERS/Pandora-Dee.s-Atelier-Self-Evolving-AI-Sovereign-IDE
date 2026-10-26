import { Num } from "./Num.tsx";
import { useEffect, useRef, useState } from "react";
import { Volume1, Volume2, VolumeX } from "lucide-react";
import { desk, useDesk } from "../lib/store.ts";
import { stopSpeaking } from "../lib/voice.ts";

/** A speaker button with a small panel: voices on/off, voice volume, game and app volume. */
export function VolumeControl({ className = "icon-btn", size = 16 }: { className?: string; size?: number }) {
  const v = useDesk((s) => s.voice);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  const set = (p: Partial<typeof v>) => desk().set({ voice: { ...desk().voice, ...p } });
  const Icon = !v.on || v.volume === 0 ? VolumeX : v.volume < 0.5 ? Volume1 : Volume2;
  return (
    <div className="volume" ref={ref}>
      <button
        className={className}
        aria-label="Volume"
        aria-expanded={open}
        data-tip={open ? undefined : `Voices ${v.on ? `${Math.round(v.volume * 100)}%` : "off"} · games ${Math.round(v.appVolume * 100)}%`}
        onClick={() => setOpen(!open)}
        onWheel={(e) => set({ volume: Math.min(1, Math.max(0, v.volume + (e.deltaY < 0 ? 0.05 : -0.05))) })}
      >
        <Icon size={size} />
      </button>
      {open ? (
        <div className="menu volume-panel" role="group" aria-label="Volume">
          <label className="check" style={{ padding: "4px 6px" }}>
            <input
              type="checkbox"
              checked={v.on}
              onChange={(e) => {
                if (!e.target.checked) stopSpeaking();
                set({ on: e.target.checked });
              }}
            />
            <span>Characters speak aloud</span>
          </label>
          <label className="vol-row">
            <span>Voices</span>
            <Num min={0} max={1} step={0.05} value={v.volume} disabled={!v.on} onChange={(n) => set({ volume: n })} aria-label="Voice volume" percent />
          </label>
          <label className="vol-row">
            <span>Games & apps</span>
            <Num min={0} max={1} step={0.05} value={v.appVolume} onChange={(n) => set({ appVolume: n })} aria-label="Game and app volume" percent />
          </label>
          <p className="small faint" style={{ margin: "4px 6px 2px" }}>
            Each character's own volume is in their profile.
          </p>
        </div>
      ) : null}
    </div>
  );
}
