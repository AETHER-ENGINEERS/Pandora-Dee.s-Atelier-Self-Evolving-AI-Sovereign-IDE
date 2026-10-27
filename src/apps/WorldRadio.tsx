import { useEffect, useMemo, useRef, useState } from "react";
import { Radar, Star } from "lucide-react";
import { current, saveStation, tune, useMusic, worldStations, type GeoStation } from "../lib/music.ts";
import { desk } from "../lib/store.ts";

/**
 * Worldband: every station with a place on the map, drawn where it broadcasts (the dots draw the
 * continents). Click near one to tune in, sweep the dial across the band, or let it scan.
 */
export function WorldRadio() {
  const [stations, setStations] = useState<GeoStation[] | null>(null);
  const [error, setError] = useState("");
  const [hover, setHover] = useState<GeoStation | null>(null);
  const [scan, setScan] = useState(false);
  const [dial, setDial] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef({ x: 0, y: 0, k: 1 }); // pan in pixels, zoom
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const playing = useMusic((s) => s.queue[s.index]);
  const now = playing?.kind === "radio" ? playing.url : "";

  useEffect(() => {
    worldStations().then(setStations, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  // the dial: stations from west to east
  const band = useMemo(() => (stations ? [...stations].sort((a, b) => a.lon - b.lon) : []), [stations]);

  const project = (lat: number, lon: number, w: number, h: number) => {
    const { x, y, k } = view.current;
    return { px: (w / 2 + (lon / 360) * w * k) + x, py: (h / 2 - (lat / 180) * h * k) + y };
  };

  const draw = () => {
    const cv = canvas.current;
    if (!cv || !stations) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = cv.getBoundingClientRect();
    if (cv.width !== Math.round(r.width * dpr)) (cv.width = Math.round(r.width * dpr)), (cv.height = Math.round(r.height * dpr));
    const g = cv.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = r.width;
    const h = r.height;
    g.clearRect(0, 0, w, h);
    const accent = getComputedStyle(cv).getPropertyValue("--accent").trim() || "#b48cff";
    // graticule
    g.strokeStyle = "rgba(255,255,255,.06)";
    g.lineWidth = 1;
    for (let lon = -180; lon <= 180; lon += 30) {
      const a = project(90, lon, w, h);
      const b = project(-90, lon, w, h);
      g.beginPath();
      g.moveTo(a.px, a.py);
      g.lineTo(b.px, b.py);
      g.stroke();
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      const a = project(lat, -180, w, h);
      const b = project(lat, 180, w, h);
      g.beginPath();
      g.moveTo(a.px, a.py);
      g.lineTo(b.px, b.py);
      g.stroke();
    }
    // stations
    const size = Math.max(1.2, Math.min(3.5, 1.2 * view.current.k));
    g.fillStyle = "rgba(160, 200, 255, .55)";
    for (const s of stations) {
      const p = project(s.lat, s.lon, w, h);
      if (p.px < -4 || p.py < -4 || p.px > w + 4 || p.py > h + 4) continue;
      g.fillRect(p.px - size / 2, p.py - size / 2, size, size);
    }
    for (const s of [hover, stations.find((x) => x.url === now)]) {
      if (!s) continue;
      const p = project(s.lat, s.lon, w, h);
      g.strokeStyle = accent;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(p.px, p.py, s.url === now ? 9 : 6, 0, Math.PI * 2);
      g.stroke();
    }
  };

  useEffect(() => {
    draw();
    const ro = new ResizeObserver(() => draw());
    if (canvas.current) ro.observe(canvas.current);
    return () => ro.disconnect();
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // zoom toward the pointer (a native listener, so the wheel doesn't also scroll the window)
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const v = view.current;
      const k2 = Math.max(1, Math.min(24, v.k * (e.deltaY < 0 ? 1.25 : 0.8)));
      const mx = e.clientX - r.left - r.width / 2 - v.x;
      const my = e.clientY - r.top - r.height / 2 - v.y;
      v.x -= mx * (k2 / v.k - 1);
      v.y -= my * (k2 / v.k - 1);
      v.k = k2;
      if (k2 === 1) (v.x = 0), (v.y = 0);
      drawRef.current();
    };
    cv.addEventListener("wheel", wheel, { passive: false });
    return () => cv.removeEventListener("wheel", wheel);
  }, []);

  const nearest = (clientX: number, clientY: number): GeoStation | null => {
    const cv = canvas.current;
    if (!cv || !stations) return null;
    const r = cv.getBoundingClientRect();
    let best: GeoStation | null = null;
    let bd = 12 * 12;
    for (const s of stations) {
      const p = project(s.lat, s.lon, r.width, r.height);
      const d = (p.px - (clientX - r.left)) ** 2 + (p.py - (clientY - r.top)) ** 2;
      if (d < bd) (bd = d), (best = s);
    }
    return best;
  };

  // scanning: a new station every 20 seconds, from the part of the map in view
  useEffect(() => {
    if (!scan || !stations) return;
    const pick = () => {
      const cv = canvas.current;
      const r = cv?.getBoundingClientRect();
      const inView = r ? stations.filter((s) => {
        const p = project(s.lat, s.lon, r.width, r.height);
        return p.px >= 0 && p.py >= 0 && p.px <= r.width && p.py <= r.height;
      }) : stations;
      const list = inView.length ? inView : stations;
      tune(list[Math.floor(Math.random() * list.length)]);
    };
    pick();
    const t = window.setInterval(pick, 20_000);
    return () => window.clearInterval(t);
  }, [scan, stations]); // eslint-disable-line react-hooks/exhaustive-deps

  // the dial settles on a station a moment after it stops moving
  const dialTimer = useRef(0);
  const turnDial = (n: number) => {
    setDial(n);
    window.clearTimeout(dialTimer.current);
    const st = band[Math.round((n / 1000) * (band.length - 1))];
    if (st) setHover(st);
    dialTimer.current = window.setTimeout(() => st && tune(st), 500);
  };

  if (error) return <div className="note small" style={{ margin: 10 }}>{error}</div>;
  const cur = current();
  return (
    <div className="worldband">
      <div className="world-map">
        <canvas
          ref={canvas}
          aria-label="Map of radio stations: click one to tune in"
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
                draw();
              }
              return;
            }
            setHover(nearest(e.clientX, e.clientY));
          }}
          onPointerUp={(e) => {
            const d = drag.current;
            drag.current = null;
            if (d && !d.moved) {
              const s = nearest(e.clientX, e.clientY);
              if (s) tune(s);
            }
          }}
        />
        {!stations ? <div className="world-wait small faint">Finding the world's stations…</div> : null}
        {hover ? (
          <div className="world-tip small">
            <b>{hover.name}</b>
            <span className="faint">{[hover.country, hover.tags?.split(",").slice(0, 3).join(", ")].filter(Boolean).join(" · ")}</span>
          </div>
        ) : null}
      </div>
      <div className="world-bar">
        <span className="small faint">West</span>
        <input type="range" min={0} max={1000} value={dial} onChange={(e) => turnDial(Number(e.target.value))} aria-label="Dial: sweep across the world's stations" disabled={!band.length} />
        <span className="small faint">East</span>
        <button className={`btn small${scan ? " primary" : ""}`} aria-pressed={scan} onClick={() => setScan(!scan)} data-tip="A new station every 20 seconds, from the part of the map in view">
          <Radar size={13} /> {scan ? "Scanning" : "Scan"}
        </button>
        {cur?.kind === "radio" ? (
          <button className="btn small" onClick={() => (saveStation(cur), desk().say(`Saved ${cur.name}.`))}>
            <Star size={13} /> Save
          </button>
        ) : null}
        <span className="small faint">{stations ? `${stations.length.toLocaleString()} stations · scroll to zoom, drag to move` : ""}</span>
      </div>
    </div>
  );
}
