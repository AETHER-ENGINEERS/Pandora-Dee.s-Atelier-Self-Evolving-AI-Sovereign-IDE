// Cats on the desktop, the classic Neko way: they wander, sit, wash, stretch, yawn and sleep wherever they like,
// on top of the windows, and never chase the pointer. Mrrowr-murrr has seniority: the others give way to her and
// don't walk past while she sleeps. Pet one by clicking it. The characters hear what the cats are up to (catsNote).
// Drawn here with shapes, until proper art is ready.

import { useEffect, useRef } from "react";
import { useDesk, type Cat } from "../lib/store.ts";
import { live, type Live, type Pose } from "../lib/cats.ts";

const W = 56;
const H = 44;
const SPEED = 55; // px per second, a cat's amble

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const bounds = () => ({ x0: 40, x1: window.innerWidth - 40, y0: 90, y1: window.innerHeight - 90 });

function pick(c: Live, senior: Live | undefined, now: number) {
  // Neko's rhythm: a wander, a sit, a wash, a yawn, and a long sleep; awake again with a stretch
  const was = c.pose;
  c.deferring = false;
  if (was === "sleep") return set(c, "stretch", now, 1800);
  if (was === "yawn") return set(c, "sleep", now, rnd(25_000, 70_000));
  const r = Math.random();
  if (r < 0.42) {
    const b = bounds();
    for (let i = 0; i < 12; i++) {
      c.tx = rnd(b.x0, b.x1);
      c.ty = rnd(b.y0, b.y1);
      // the others keep out of the senior cat's way, and well clear while she sleeps
      if (!senior || senior === c || Math.hypot(c.tx - senior.x, c.ty - senior.y) > (senior.pose === "sleep" ? 160 : 90)) break;
    }
    return set(c, "walk", now, 60_000);
  }
  if (r < 0.62) return set(c, "sit", now, rnd(4000, 11_000));
  if (r < 0.8) return set(c, "wash", now, rnd(3000, 7000));
  if (r < 0.88) return set(c, "stretch", now, 1800);
  return set(c, "yawn", now, 1300);
}
function set(c: Live, pose: Pose, now: number, ms: number) {
  c.pose = pose;
  c.until = now + ms;
  c.t = 0;
}

// ---------- drawing ----------

function luminance(hex: string) {
  const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

function drawCat(g: CanvasRenderingContext2D, cat: Cat, c: Live) {
  // a dark outline, or a light one for a dark coat (so a black cat still shows on a dark desktop)
  const ink = luminance(cat.coat) < 0.22 ? "rgba(235,230,245,.6)" : "rgba(20,16,28,.75)";
  g.clearRect(0, 0, W, H);
  g.save();
  if (c.face === -1) (g.translate(W, 0), g.scale(-1, 1));
  g.lineWidth = 1.3;
  g.lineCap = "round";
  g.lineJoin = "round";
  const t = c.t;
  const fill = (col: string) => ((g.fillStyle = col), g.fill(), (g.strokeStyle = ink), g.stroke());
  const ellipse = (x: number, y: number, rx: number, ry: number, rot = 0) => (g.beginPath(), g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2));
  const leg = (x: number, y: number, dx: number, len: number) => {
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + dx, y + len);
    g.strokeStyle = ink;
    g.lineWidth = 4.2;
    g.stroke();
    g.strokeStyle = cat.coat;
    g.lineWidth = 2.6;
    g.stroke();
    g.lineWidth = 1.3;
  };
  const head = (x: number, y: number, r: number, tilt = 0, mouth = false, closed = false) => {
    g.save();
    g.translate(x, y);
    g.rotate(tilt);
    // ears
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * r * 0.85, -r * 0.35);
      g.lineTo(s * r * 0.7, -r * 1.35);
      g.lineTo(s * r * 0.1, -r * 0.85);
      g.closePath();
      fill(cat.coat);
    }
    ellipse(0, 0, r, r * 0.88);
    fill(cat.coat);
    // a little forehead stripe
    g.beginPath();
    g.moveTo(-1.5, -r * 0.8);
    g.lineTo(-1, -r * 0.35);
    g.moveTo(1.5, -r * 0.8);
    g.lineTo(1, -r * 0.35);
    g.strokeStyle = cat.marks;
    g.stroke();
    // eyes
    g.fillStyle = closed ? ink : cat.eyes;
    if (closed) {
      g.beginPath();
      g.arc(-r * 0.38, r * 0.05, 1.8, 0.15 * Math.PI, 0.85 * Math.PI);
      g.arc(r * 0.38, r * 0.05, 1.8, 0.15 * Math.PI, 0.85 * Math.PI);
      g.strokeStyle = ink;
      g.stroke();
    } else {
      for (const s of [-1, 1]) {
        ellipse(s * r * 0.38, 0, 1.9, 2.3);
        g.fillStyle = cat.eyes;
        g.fill();
        ellipse(s * r * 0.38, 0, 0.7, 1.7);
        g.fillStyle = ink;
        g.fill();
      }
    }
    // nose and mouth
    g.beginPath();
    g.moveTo(-1.2, r * 0.38);
    g.lineTo(1.2, r * 0.38);
    g.lineTo(0, r * 0.55);
    g.closePath();
    g.fillStyle = "#e7a0ad";
    g.fill();
    if (mouth) {
      ellipse(0, r * 0.75, 1.8, 2.2);
      g.fillStyle = "#7a2a3a";
      g.fill();
    }
    g.restore();
  };
  const tail = (x: number, y: number, pts: [number, number, number, number, number, number]) => {
    g.beginPath();
    g.moveTo(x, y);
    g.bezierCurveTo(...pts);
    g.strokeStyle = ink;
    g.lineWidth = 5;
    g.stroke();
    g.strokeStyle = cat.coat;
    g.lineWidth = 3.2;
    g.stroke();
    g.lineWidth = 1.3;
  };
  const stripes = (x: number, y: number, n: number, gap: number, len: number) => {
    g.strokeStyle = cat.marks;
    g.lineWidth = 1.8;
    for (let i = 0; i < n; i++) {
      g.beginPath();
      g.moveTo(x + i * gap, y);
      g.lineTo(x + i * gap - 1.5, y + len);
      g.stroke();
    }
    g.lineWidth = 1.3;
  };

  if (c.pose === "walk") {
    const s = Math.sin(t * 9);
    const sway = Math.sin(t * 3) * 4;
    tail(12, 24, [6, 20, 2 + sway, 10, 6 + sway, 5]);
    leg(16, 30, s * 3, 10);
    leg(34, 30, -s * 3, 10);
    ellipse(25, 26, 15, 7.5);
    fill(cat.coat);
    ellipse(25, 30, 10, 3);
    g.fillStyle = cat.belly;
    g.fill();
    stripes(20, 20, 3, 5, 5);
    leg(20, 30, -s * 3, 10);
    leg(38, 30, s * 3, 10);
    head(43, 18 + Math.abs(s) * 0.8, 8);
  } else if (c.pose === "stretch") {
    // front low, back high
    tail(10, 18, [5, 12, 4, 4, 9, 2]);
    leg(14, 24, 0, 16);
    leg(40, 34, 6, 6);
    ellipse(26, 27, 16, 6.5, 0.32);
    fill(cat.coat);
    stripes(20, 21, 3, 5, 5);
    leg(18, 24, 1, 16);
    leg(44, 34, 7, 6);
    head(46, 30, 7.5, 0.2, c.t > 0.5 && c.t < 1.3);
  } else if (c.pose === "sleep") {
    const breathe = 1 + Math.sin(t * 2.2) * 0.04;
    ellipse(26, 33, 17 * breathe, 8.5 * breathe);
    fill(cat.coat);
    stripes(20, 26, 4, 5, 5);
    tail(10, 38, [16, 44, 32, 44, 40, 38]);
    head(37, 31, 7.5, 0.5, false, true);
  } else {
    // sitting, washing or yawning
    const washing = c.pose === "wash";
    const lick = washing ? Math.sin(t * 7) : 0;
    tail(16, 40, [6, 40, 4, 34, 9, 30]);
    ellipse(24, 29, 10, 12);
    fill(cat.coat);
    ellipse(26, 32, 6, 8);
    g.fillStyle = cat.belly;
    g.fill();
    stripes(18, 22, 3, 4, 6);
    leg(21, 32, 0, 9);
    if (washing) leg(28, 32, 6, -9 - lick * 2);
    else leg(28, 32, 0, 9);
    head(29, 14 + (washing ? 2 : 0), 8.5, washing ? 0.35 + lick * 0.08 : 0, c.pose === "yawn", c.pose === "yawn");
  }
  g.restore();
}

// ---------- the layer ----------

export function Cats() {
  const s = useDesk();
  const on = s.cats.on && s.cats.list.length > 0;
  const canvases = useRef(new Map<string, HTMLCanvasElement>());
  const bubbles = useRef(new Map<string, HTMLDivElement>());
  const list = s.cats.list;
  const scale = s.cats.size;

  useEffect(() => {
    if (!on) return;
    const now = performance.now();
    const b = bounds();
    // new cats arrive somewhere along the bottom; known ones keep their place
    for (const c of list)
      if (!live.has(c.id)) {
        const x = rnd(b.x0, b.x1);
        live.set(c.id, { id: c.id, name: c.name, x, y: b.y1, tx: x, ty: b.y1, face: Math.random() < 0.5 ? 1 : -1, pose: "sit", until: now + rnd(1500, 5000), t: 0, petted: 0, pettedAt: 0, deferring: false });
      }
    for (const id of [...live.keys()]) if (!list.some((c) => c.id === id)) live.delete(id);

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (document.hidden) return;
      const senior = live.get(list[0]?.id);
      for (const cat of list) {
        const c = live.get(cat.id);
        const el = canvases.current.get(cat.id);
        if (!c || !el) continue;
        c.t += dt;
        if (c.pose === "walk") {
          const dx = c.tx - c.x;
          const dy = c.ty - c.y;
          const d = Math.hypot(dx, dy);
          if (Math.abs(dx) > 2) c.face = dx > 0 ? 1 : -1;
          // meeting the senior cat on the way: stop, look elsewhere, and have a wash
          if (senior && senior !== c && Math.hypot(senior.x - c.x, senior.y - c.y) < 55) {
            c.face = senior.x > c.x ? -1 : 1;
            set(c, "wash", now, rnd(2500, 5000));
            c.deferring = true;
          } else if (d < 2) set(c, "sit", now, rnd(3000, 8000));
          else {
            const step = Math.min(d, SPEED * dt);
            c.x += (dx / d) * step;
            c.y += (dy / d) * step;
          }
        } else if (now > c.until) pick(c, senior, now);
        const g = el.getContext("2d");
        if (g) {
          g.setTransform(el.width / W, 0, 0, el.height / H, 0, 0);
          drawCat(g, cat, c);
        }
        el.style.transform = `translate(${Math.round(c.x - (W * scale) / 2)}px, ${Math.round(c.y - H * scale)}px)`;
        const bub = bubbles.current.get(cat.id);
        if (bub) {
          const purring = now - c.pettedAt < 1800;
          bub.textContent = purring ? "♥ prrr" : c.pose === "sleep" ? "z z" : "";
          bub.style.opacity = bub.textContent ? (c.pose === "sleep" && !purring ? String(0.45 + Math.sin(c.t * 1.5) * 0.25) : "1") : "0";
          bub.style.transform = `translate(${Math.round(c.x + (c.face === 1 ? 4 : -28) * scale)}px, ${Math.round(c.y - H * scale - 10)}px)`;
        }
      }
    };
    raf = requestAnimationFrame(tick);
    const keepIn = () => {
      const nb = bounds();
      for (const c of live.values()) {
        c.x = Math.min(nb.x1, Math.max(nb.x0, c.x));
        c.y = Math.min(nb.y1, Math.max(nb.y0, c.y));
        c.tx = Math.min(nb.x1, Math.max(nb.x0, c.tx));
        c.ty = Math.min(nb.y1, Math.max(nb.y0, c.ty));
      }
    };
    window.addEventListener("resize", keepIn);
    return () => (cancelAnimationFrame(raf), window.removeEventListener("resize", keepIn));
  }, [on, list, scale]);

  if (!on) return null;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  return (
    <div className="cats" aria-hidden>
      {list.map((cat) => (
        <div key={cat.id}>
          <canvas
            ref={(el) => void (el ? canvases.current.set(cat.id, el) : canvases.current.delete(cat.id))}
            className="cat"
            width={Math.round(W * scale * dpr)}
            height={Math.round(H * scale * dpr)}
            style={{ width: W * scale, height: H * scale }}
            title={cat.name}
            onClick={() => {
              const c = live.get(cat.id);
              if (!c) return;
              c.petted++;
              c.pettedAt = performance.now();
              // a sleeping cat wakes slowly; an awake one sits for it
              if (c.pose === "sleep") set(c, "stretch", performance.now(), 1800);
              else if (c.pose === "walk") set(c, "sit", performance.now(), rnd(4000, 8000));
            }}
          />
          <div ref={(el) => void (el ? bubbles.current.set(cat.id, el) : bubbles.current.delete(cat.id))} className="cat-bubble" />
        </div>
      ))}
    </div>
  );
}
