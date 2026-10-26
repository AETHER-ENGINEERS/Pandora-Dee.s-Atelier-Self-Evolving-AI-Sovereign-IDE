import { useEffect, useMemo, useRef, useState } from "react";
import { noteName, vaultIndex, useNotes } from "../lib/notes.ts";

type Node = { id: string; x: number; y: number; vx: number; vy: number; deg: number };

/** Notes within `hops` links of the centre (both directions). */
function neighbourhood(center: string, hops: number) {
  const idx = vaultIndex();
  const seen = new Set([center]);
  let ring = [center];
  for (let h = 0; h < hops; h++) {
    const next: string[] = [];
    for (const p of ring) for (const q of [...(idx.out.get(p) ?? []), ...(idx.back.get(p) ?? [])]) if (!seen.has(q)) (seen.add(q), next.push(q));
    ring = next;
  }
  return seen;
}

/**
 * The notes as dots and their links as lines. With `center`, only the notes within two links of it.
 * Click a dot to open it; drag to move around; scroll to zoom.
 */
export function NoteGraph({ center, onOpen, compact = false }: { center?: string; onOpen: (path: string) => void; compact?: boolean }) {
  const version = useNotes((s) => s.version);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hover = useRef<string | null>(null);
  const [pointer, setPointer] = useState(false);
  const view = useRef({ x: 0, y: 0, k: 1 });
  const { nodes, edges } = useMemo(() => {
    const idx = vaultIndex();
    const keep = center ? neighbourhood(center, 2) : new Set(idx.notes);
    const list = idx.notes.filter((p) => keep.has(p));
    const at = new Map(list.map((p, i) => [p, i]));
    const e: [number, number][] = [];
    for (const p of list) for (const q of idx.out.get(p) ?? []) if (at.has(q)) e.push([at.get(p)!, at.get(q)!]);
    const n: Node[] = list.map((id, i) => {
      const a = (i / Math.max(1, list.length)) * Math.PI * 2;
      const r = 40 + 8 * Math.sqrt(list.length) * ((i * 7919) % 97) / 97;
      return { id, x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0, deg: (idx.out.get(id)?.size ?? 0) + (idx.back.get(id)?.size ?? 0) };
    });
    return { nodes: n, edges: e };
  }, [center, version]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    const css = getComputedStyle(cv);
    const accent = css.getPropertyValue("--accent").trim() || "#b48cff";
    const text = css.getPropertyValue("--text").trim() || "#eee";
    const line = css.getPropertyValue("--line-strong").trim() || "rgba(255,255,255,.2)";
    let frame = 0;
    let steps = 0;
    let raf = 0;
    const size = () => {
      const r = cv.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      cv.width = Math.max(1, r.width * dpr);
      cv.height = Math.max(1, r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return r;
    };
    let rect = size();
    const ro = new ResizeObserver(() => (rect = size()));
    ro.observe(cv);
    const radius = (n: Node) => 3 + Math.min(9, Math.sqrt(n.deg) * 1.6);
    const tick = () => {
      // a simple force layout: everything pushes apart, links pull together, the middle pulls gently
      if (steps < 400) {
        steps++;
        const cool = 1 - steps / 420;
        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i];
          for (let j = i + 1; j < nodes.length; j++) {
            const b = nodes[j];
            let dx = a.x - b.x;
            let dy = a.y - b.y;
            let d2 = dx * dx + dy * dy;
            if (d2 < 0.01) (dx = Math.random() - 0.5), (dy = Math.random() - 0.5), (d2 = 0.5);
            if (d2 > 90000) continue;
            const f = 600 / d2;
            a.vx += dx * f;
            a.vy += dy * f;
            b.vx -= dx * f;
            b.vy -= dy * f;
          }
        }
        for (const [i, j] of edges) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const f = (d - 60) * 0.02;
          a.vx += (dx / d) * f;
          a.vy += (dy / d) * f;
          b.vx -= (dx / d) * f;
          b.vy -= (dy / d) * f;
        }
        for (const n of nodes) {
          n.vx -= n.x * 0.004;
          n.vy -= n.y * 0.004;
          n.x += Math.max(-8, Math.min(8, n.vx)) * cool;
          n.y += Math.max(-8, Math.min(8, n.vy)) * cool;
          n.vx *= 0.6;
          n.vy *= 0.6;
        }
      }
      const { x: ox, y: oy, k } = view.current;
      const cx = rect.width / 2 + ox;
      const cy = rect.height / 2 + oy;
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.strokeStyle = line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const [i, j] of edges) {
        ctx.moveTo(cx + nodes[i].x * k, cy + nodes[i].y * k);
        ctx.lineTo(cx + nodes[j].x * k, cy + nodes[j].y * k);
      }
      ctx.stroke();
      ctx.font = `${compact ? 10 : 11}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      for (const n of nodes) {
        const x = cx + n.x * k;
        const y = cy + n.y * k;
        const on = n.id === center || n.id === hover.current;
        ctx.beginPath();
        ctx.fillStyle = on ? accent : n.deg ? text : "rgba(160,160,180,.55)";
        ctx.globalAlpha = on ? 1 : 0.8;
        ctx.arc(x, y, radius(n) * (on ? 1.3 : 1), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        if (on || (!compact && (k > 0.9 || n.deg > 3))) {
          ctx.fillStyle = on ? accent : text;
          ctx.fillText(noteName(n.id), x, y - radius(n) - 4);
        }
      }
      frame++;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      void frame;
    };
  }, [nodes, edges, center, compact]);

  const pick = (e: { clientX: number; clientY: number }) => {
    const cv = canvas.current!;
    const r = cv.getBoundingClientRect();
    const { x: ox, y: oy, k } = view.current;
    const mx = (e.clientX - r.left - r.width / 2 - ox) / k;
    const my = (e.clientY - r.top - r.height / 2 - oy) / k;
    let best: Node | null = null;
    let bd = (14 / k) ** 2;
    for (const n of nodes) {
      const d = (n.x - mx) ** 2 + (n.y - my) ** 2;
      if (d < bd) (bd = d), (best = n);
    }
    return best;
  };
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  return (
    <div className={`note-graph${compact ? " compact" : ""}`}>
      <canvas
        ref={canvas}
        style={{ cursor: pointer ? "pointer" : "grab" }}
        role="img"
        aria-label={center ? `Notes linked to ${noteName(center)}` : `Graph of ${nodes.length} notes`}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) {
            const dx = e.clientX - d.x;
            const dy = e.clientY - d.y;
            if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
            if (d.moved) {
              view.current.x += dx;
              view.current.y += dy;
              d.x = e.clientX;
              d.y = e.clientY;
            }
            return;
          }
          hover.current = pick(e)?.id ?? null;
          setPointer(Boolean(hover.current));
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved) {
            const n = pick(e);
            if (n) onOpen(n.id);
          }
        }}
        onWheel={(e) => {
          view.current.k = Math.max(0.2, Math.min(4, view.current.k * (e.deltaY < 0 ? 1.12 : 0.89)));
        }}
      />
      {!compact ? <div className="graph-note small faint">{nodes.length} notes · {edges.length} links · drag to move, scroll to zoom, click a dot to open it</div> : null}
    </div>
  );
}
