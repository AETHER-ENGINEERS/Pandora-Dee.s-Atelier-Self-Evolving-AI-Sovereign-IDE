import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Wallpaper } from "lucide-react";
import { audioGraph, useMusic } from "../lib/music.ts";
import { desk, useDesk } from "../lib/store.ts";

type Preset = Record<string, unknown>;
type Butterchurn = {
  createVisualizer: (ctx: AudioContext, canvas: HTMLCanvasElement, opts: { width: number; height: number; pixelRatio?: number }) => {
    connectAudio: (node: AudioNode) => void;
    loadPreset: (p: Preset, blend: number) => void;
    setRendererSize: (w: number, h: number) => void;
    render: () => void;
  };
};

const PRESET_DIR = ".pandora/milkdrop";
let packs: Promise<Record<string, Preset>> | null = null;

/** Butterchurn's preset packs (loaded the first time Milkdrop is chosen), plus presets you imported. */
export function milkdropPresets(): Promise<Record<string, Preset>> {
  return (packs ??= (async () => {
    const [base, extra, extra2] = await Promise.all([
      import("butterchurn-presets/lib/butterchurnPresets.min.js"),
      import("butterchurn-presets/lib/butterchurnPresetsExtra.min.js"),
      import("butterchurn-presets/lib/butterchurnPresetsExtra2.min.js"),
    ]);
    const get = (m: { default?: { getPresets?: () => Record<string, Preset> }; getPresets?: () => Record<string, Preset> }) => (m.default?.getPresets ?? m.getPresets)?.() ?? {};
    const all = { ...get(base), ...get(extra), ...get(extra2) };
    try {
      const list = (await (await fetch(`/api/vault/list?path=${encodeURIComponent(PRESET_DIR)}`)).json()) as { name: string; dir: boolean }[];
      for (const f of list.filter((x) => !x.dir && x.name.endsWith(".json"))) {
        const r = await fetch(`/api/vault/file?path=${encodeURIComponent(`${PRESET_DIR}/${f.name}`)}`);
        if (r.ok) all[`★ ${f.name.replace(/\.json$/, "")}`] = (await r.json()) as Preset;
      }
    } catch {
      /* none imported yet */
    }
    return all;
  })());
}

/** Bring in Butterchurn presets (.json). Classic Milkdrop .milk files need converting first. */
export async function importPresets(files: File[]) {
  let n = 0;
  for (const f of files) {
    if (!/\.json$/i.test(f.name)) continue;
    const text = await f.text();
    try {
      JSON.parse(text);
    } catch {
      continue;
    }
    await fetch(`/api/vault/file?path=${encodeURIComponent(`${PRESET_DIR}/${f.name.replace(/[^\w .()-]+/g, "_")}`)}`, { method: "PUT", body: text });
    n++;
  }
  packs = null;
  return n;
}

/** The picture that moves with the music: bars, a scope, or Milkdrop. */
export function Visualizer({ big = false }: { big?: boolean }) {
  const mode = useDesk((s) => s.music.viz);
  const preset = useDesk((s) => s.music.preset);
  const cycle = useDesk((s) => s.music.cycle);
  const playing = useMusic((s) => s.playing);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    const cv = canvas.current;
    const { analyser, ctx, source } = audioGraph();
    if (!cv || mode === "off" || !analyser || !ctx || !source) return;
    let raf = 0;
    let stopped = false;
    const fit = () => {
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.max(1, Math.round(r.width * dpr));
      cv.height = Math.max(1, Math.round(r.height * dpr));
      return { w: cv.width, h: cv.height };
    };
    let size = fit();

    if (mode === "milkdrop") {
      let viz: ReturnType<Butterchurn["createVisualizer"]> | null = null;
      let cycleTimer = 0;
      void (async () => {
        try {
          const bc = (await import("butterchurn")) as unknown as { default?: Butterchurn } & Butterchurn;
          const lib = bc.default ?? bc;
          // Milkdrop draws with WebGL 2; say so plainly when this browser or its graphics settings don't offer it
          if (!document.createElement("canvas").getContext("webgl2")) {
            setNote("Milkdrop needs WebGL 2, which this browser isn't offering. Turn on hardware acceleration (graphics) in the browser's settings, or use Bars or Scope.");
            return;
          }
          const presets = await milkdropPresets();
          if (stopped) return;
          viz = lib.createVisualizer(ctx, cv, { width: size.w, height: size.h, pixelRatio: 1 });
          viz.connectAudio(source);
          const names = Object.keys(presets);
          const pick = (name: string) => {
            const p = presets[name];
            if (!p || !viz) return;
            viz.loadPreset(p, 2.0);
            setNote(name);
            if (desk().music.preset !== name) desk().set({ music: { ...desk().music, preset: name } });
          };
          pick(preset && presets[preset] ? preset : names[Math.floor(Math.random() * names.length)]);
          if (cycle) cycleTimer = window.setInterval(() => pick(names[Math.floor(Math.random() * names.length)]), 25_000);
          const loop = () => {
            if (stopped) return;
            viz?.render();
            raf = requestAnimationFrame(loop);
          };
          loop();
        } catch (e) {
          setNote(`Milkdrop couldn't start (${e instanceof Error ? e.message : e}).`);
        }
      })();
      const ro = new ResizeObserver(() => {
        size = fit();
        viz?.setRendererSize(size.w, size.h);
      });
      ro.observe(cv);
      return () => {
        stopped = true;
        cancelAnimationFrame(raf);
        window.clearInterval(cycleTimer);
        ro.disconnect();
      };
    }

    const g = cv.getContext("2d")!;
    const freq = new Uint8Array(analyser.frequencyBinCount);
    const wave = new Uint8Array(analyser.fftSize);
    const accent = getComputedStyle(cv).getPropertyValue("--accent").trim() || "#b48cff";
    const ro = new ResizeObserver(() => (size = fit()));
    ro.observe(cv);
    const draw = () => {
      if (stopped) return;
      const { w, h } = size;
      g.clearRect(0, 0, w, h);
      if (mode === "bars") {
        analyser.getByteFrequencyData(freq);
        const bars = Math.min(96, Math.floor(w / 6));
        const bw = w / bars;
        for (let i = 0; i < bars; i++) {
          // a log scale, so the bass doesn't take every bar
          const from = Math.floor((freq.length / 2) * (Math.pow(2, (i / bars) * 9) - 1) / 511);
          const to = Math.max(from + 1, Math.floor((freq.length / 2) * (Math.pow(2, ((i + 1) / bars) * 9) - 1) / 511));
          let v = 0;
          for (let k = from; k < to; k++) v = Math.max(v, freq[k]);
          const bh = (v / 255) * h * 0.92;
          const grad = g.createLinearGradient(0, h, 0, h - bh);
          grad.addColorStop(0, accent);
          grad.addColorStop(1, "rgba(255,255,255,.85)");
          g.fillStyle = grad;
          g.fillRect(i * bw + 1, h - bh, Math.max(1, bw - 2), bh);
        }
      } else {
        analyser.getByteTimeDomainData(wave);
        g.lineWidth = Math.max(1.5, h / 160);
        g.strokeStyle = accent;
        g.shadowColor = accent;
        g.shadowBlur = 12;
        g.beginPath();
        for (let i = 0; i < wave.length; i++) {
          const x = (i / (wave.length - 1)) * w;
          const y = (wave[i] / 255) * h;
          if (i) g.lineTo(x, y);
          else g.moveTo(x, y);
        }
        g.stroke();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [mode, cycle, playing]); // eslint-disable-line react-hooks/exhaustive-deps

  if (mode === "off") return null;
  return (
    <div className={`visualizer${big ? " big" : ""}`}>
      {/* a fresh canvas per mode: one that drew in 2D can't be used for WebGL */}
      <canvas key={mode} ref={canvas} aria-label={`Visualizer: ${mode}`} />
      {!audioGraph().analyser ? <div className="viz-wait small faint">Starts with the music.</div> : null}
      {mode === "milkdrop" && note ? <div className="viz-note small">{note}</div> : null}
    </div>
  );
}

/** The visualizer in its own window: resize it, make it full screen, or put it behind everything. */
export function VisualizerApp() {
  const m = useDesk((s) => s.music);
  const box = useRef<HTMLDivElement>(null);
  const set = (p: Partial<typeof m>) => desk().set({ music: { ...desk().music, ...p } });
  const playing = useMusic((s) => s.playing);
  // when the browser won't go full screen (some embedded views refuse), fill the desktop window instead
  const [filled, setFilled] = useState(false);
  const full = async () => {
    if (filled) return setFilled(false);
    if (!(await toggleFullscreen(box.current))) setFilled(true);
  };
  useEffect(() => {
    if (!filled) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setFilled(false);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [filled]);
  const view = (
    <div className={`viz-window${filled ? " filled" : ""}`} ref={box} onDoubleClick={() => void full()}>
      {m.viz === "off" ? <div className="empty">The visualizer is off. Pick one below.</div> : <Visualizer big />}
      {!playing ? <div className="viz-hint small faint">Play something in Music to see it move.</div> : null}
      <div className="viz-bar">
        <select className="select" value={m.viz} onChange={(e) => set({ viz: e.target.value as typeof m.viz })} aria-label="Visualizer">
          <option value="bars">Bars</option>
          <option value="scope">Scope</option>
          <option value="milkdrop">Milkdrop</option>
          <option value="off">Off</option>
        </select>
        {m.viz === "milkdrop" ? (
          <label className="check small" style={{ padding: 0 }}>
            <input type="checkbox" checked={m.cycle} onChange={(e) => set({ cycle: e.target.checked })} />
            <span>New preset every 25 s</span>
          </label>
        ) : null}
        <span className="grow" />
        <button className={`btn small${m.vizBackground ? " primary" : ""}`} onClick={() => set({ vizBackground: !m.vizBackground })} aria-pressed={m.vizBackground}>
          <Wallpaper size={13} /> {m.vizBackground ? "On the background" : "As the background"}
        </button>
        <button className="btn small" onClick={() => void full()} data-tip="Double-click the picture does the same. Esc leaves.">
          <Maximize2 size={13} /> {filled ? "Leave full screen" : "Full screen"}
        </button>
      </div>
    </div>
  );
  // filled sits on top of the whole page, outside the window frame (which would hold it inside)
  return filled ? (
    <>
      <div className="empty small faint">Full screen. Esc leaves.</div>
      {createPortal(view, document.body)}
    </>
  ) : (
    view
  );
}

/** Full screen on or off; false when the browser refused. */
export async function toggleFullscreen(el: HTMLElement | null): Promise<boolean> {
  if (document.fullscreenElement) return document.exitFullscreen().then(() => true, () => false);
  if (!el?.requestFullscreen) return false;
  return el.requestFullscreen().then(() => true, () => false);
}
