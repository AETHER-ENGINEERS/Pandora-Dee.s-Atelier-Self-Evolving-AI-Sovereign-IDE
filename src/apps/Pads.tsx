import { useEffect, useRef, useState } from "react";
import { Gamepad2, Laptop, Monitor, Smartphone, Tablet, Tv, HelpCircle, Music2, Sparkles, ZoomIn, ZoomOut, Maximize } from "lucide-react";
import { useDesk } from "../lib/store.ts";
import { askUser } from "../ui/Ask.tsx";
import { openMenu } from "../ui/ContextMenu.tsx";
import { deviceId, KINDS, myName, padsApi, setMe, useMe, type Device, type Kind } from "../lib/pads.ts";

/** How big a device's card is: its screen, at this scale (so a phone is narrow and tall, a TV wide). */
const SCALE = 0.13;
const ICON: Record<Kind, typeof Monitor> = { desktop: Monitor, laptop: Laptop, mac: Laptop, phone: Smartphone, tablet: Tablet, console: Gamepad2, tv: Tv, handheld: Gamepad2, other: HelpCircle };
const PAD = 28; // room around a card for its name below and the song above
const clampK = (k: number) => Math.min(4, Math.max(0.15, k));
type View = { x: number; y: number; k: number };
const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`;
};

/** PADS Manager: every SEASIDE of this account that joined PADS, arranged the way the devices sit in the room. */
export function PadsApp() {
  const me = useMe();
  const session = useDesk((s) => s.session);
  const [devices, setDevices] = useState<Device[]>([]);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const room = useRef<HTMLDivElement>(null);
  const mine = deviceId();
  // the room is a canvas: where it's panned to, and how far in it's zoomed
  const [view, setViewState] = useState<View>({ x: 40, y: 40, k: 1 });
  const viewRef = useRef(view);
  const setView = (v: View) => ((viewRef.current = v), setViewState(v));
  const fitted = useRef(false);

  // the roster, fresh every few seconds while the window is open
  useEffect(() => {
    let alive = true;
    const load = () => void padsApi.roster().then((d) => alive && setDevices(d), () => undefined);
    load();
    const t = setInterval(load, 3000);
    return () => ((alive = false), clearInterval(t));
  }, [session, me.on]);

  const join = async (on: boolean) => {
    if (on) {
      const yes = await askUser(
        "Show this device in PADS?",
        "Your other devices signed into this account will see this device's name, its kind, its screen size and what's open on it (window titles, the song playing), while PADS is on here. Nothing else leaves it: not its files, not what's inside the windows. You can switch it off here any time.",
        "Show it",
        "Not now",
      );
      if (!yes) return;
    }
    setMe({ on });
    if (!on) void padsApi.forget(mine).then(() => setDevices((d) => d.filter((x) => x.id !== mine)));
  };

  // where cards are, with the one being dragged where the pointer has it
  const at = (d: Device) => (drag?.id === d.id ? { x: drag.x, y: drag.y } : d.layout);
  const size = (d: Device) => ({ w: Math.max(56, d.screen.w * SCALE), h: Math.max(56, d.screen.h * SCALE) });

  // Pointer positions inside the room, in its own CSS pixels (SEASIDE's zoom makes these differ from screen pixels).
  const local = (cx: number, cy: number) => {
    const el = room.current!;
    const r = el.getBoundingClientRect();
    const f = r.width / (el.offsetWidth || 1) || 1;
    return { x: (cx - r.left) / f, y: (cy - r.top) / f };
  };
  /** Zoom to k, keeping the point (px, py) of the room where it is. */
  const zoomAt = (k: number, px: number, py: number, from = viewRef.current) => {
    const nk = clampK(k);
    setView({ k: nk, x: px - ((px - from.x) / from.k) * nk, y: py - ((py - from.y) / from.k) * nk });
  };
  /** Everything in sight. */
  const fit = () => {
    const el = room.current;
    if (!el || !devices.length) return;
    const xs = devices.flatMap((d) => [d.layout.x - PAD, d.layout.x + size(d).w + PAD]);
    const ys = devices.flatMap((d) => [d.layout.y - PAD, d.layout.y + size(d).h + PAD]);
    const bw = Math.max(...xs) - Math.min(...xs);
    const bh = Math.max(...ys) - Math.min(...ys);
    const k = clampK(Math.min(2, (el.clientWidth - 24) / bw, (el.clientHeight - 24) / bh));
    setView({ k, x: (el.clientWidth - bw * k) / 2 - Math.min(...xs) * k, y: (el.clientHeight - bh * k) / 2 - Math.min(...ys) * k });
  };
  useEffect(() => {
    if (devices.length && !fitted.current) {
      fitted.current = true;
      fit();
    }
  });

  // Gestures: one finger (or the mouse) drags a card, or pans on empty space; two fingers pinch and pan together.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const mode = useRef<
    | { kind: "card"; id: string; sx: number; sy: number; lx: number; ly: number; moved: boolean }
    | { kind: "pan"; sx: number; sy: number; v: View }
    | { kind: "pinch"; d0: number; mx: number; my: number; v: View }
    | null
  >(null);
  const twoOf = () => {
    const [a, b] = [...pointers.current.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };
  const startPan = () => {
    const [p] = [...pointers.current.values()];
    mode.current = p ? { kind: "pan", sx: p.x, sy: p.y, v: viewRef.current } : null;
  };
  const onDown = (e: React.PointerEvent) => {
    if (e.button === 2 || (e.target as Element).closest(".pads-zoom")) return;
    try {
      room.current?.setPointerCapture(e.pointerId);
    } catch {
      /* a pointer the browser no longer knows (it lifted already) */
    }
    pointers.current.set(e.pointerId, local(e.clientX, e.clientY));
    if (pointers.current.size === 2) {
      // a second finger: a card being dragged goes back, and the pinch begins
      if (mode.current?.kind === "card") setDrag(null);
      const t = twoOf();
      mode.current = { kind: "pinch", d0: t.d, mx: t.mx, my: t.my, v: viewRef.current };
      return;
    }
    if (pointers.current.size > 2) return;
    const card = (e.target as Element).closest<HTMLElement>("[data-device]");
    const d = card && e.button === 0 ? devices.find((x) => x.id === card.dataset.device) : undefined;
    const p = pointers.current.get(e.pointerId)!;
    if (d) {
      mode.current = { kind: "card", id: d.id, sx: p.x, sy: p.y, lx: d.layout.x, ly: d.layout.y, moved: false };
      setDrag({ id: d.id, x: d.layout.x, y: d.layout.y });
    } else startPan();
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, p);
    const m = mode.current;
    if (!m) return;
    if (m.kind === "pinch" && pointers.current.size >= 2) {
      const t = twoOf();
      // follow the fingers as they move together, and zoom about where they are
      const v = { ...m.v, x: m.v.x + (t.mx - m.mx), y: m.v.y + (t.my - m.my) };
      zoomAt(m.v.k * (t.d / m.d0), t.mx, t.my, v);
    } else if (m.kind === "pan") setView({ ...m.v, x: m.v.x + p.x - m.sx, y: m.v.y + p.y - m.sy });
    else if (m.kind === "card") {
      const k = viewRef.current.k;
      if (Math.hypot(p.x - m.sx, p.y - m.sy) > 3) m.moved = true;
      setDrag({ id: m.id, x: Math.round(m.lx + (p.x - m.sx) / k), y: Math.round(m.ly + (p.y - m.sy) / k) });
    }
  };
  const onUp = (e: React.PointerEvent) => {
    if (!pointers.current.delete(e.pointerId)) return;
    const m = mode.current;
    if (m?.kind === "card" && drag) {
      const { id, x, y } = drag;
      setDrag(null);
      if (m.moved) {
        setDevices((ds) => ds.map((d) => (d.id === id ? { ...d, layout: { x, y } } : d)));
        void padsApi.arrange({ [id]: { x, y } });
      }
    }
    // lifting one finger of a pinch carries on as a pan with the other
    if (pointers.current.size === 1) startPan();
    else if (!pointers.current.size) mode.current = null;
  };

  // Touchpads and wheels: two-finger drags pan; pinches (Ctrl+wheel; gesture events in Safari) zoom.
  useEffect(() => {
    const el = room.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const u = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      const p = local(e.clientX, e.clientY);
      if (e.ctrlKey) zoomAt(viewRef.current.k * Math.exp(-Math.max(-60, Math.min(60, e.deltaY * u)) * 0.01), p.x, p.y);
      else {
        const v = viewRef.current;
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
        setView({ ...v, x: v.x - dx * u, y: v.y - dy * u });
      }
    };
    let g: { k: number } | null = null;
    const gesture = (e: Event & { scale?: number; clientX?: number; clientY?: number }) => {
      e.preventDefault();
      if (e.type === "gesturestart") g = { k: viewRef.current.k };
      else if (g) {
        const p = local(e.clientX ?? 0, e.clientY ?? 0);
        zoomAt(g.k * (e.scale ?? 1), p.x, p.y);
      }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    for (const t of ["gesturestart", "gesturechange"]) el.addEventListener(t, gesture as EventListener, { passive: false });
    return () => {
      el.removeEventListener("wheel", wheel);
      for (const t of ["gesturestart", "gesturechange"]) el.removeEventListener(t, gesture as EventListener);
    };
  }, []);

  const center = () => ({ x: (room.current?.clientWidth ?? 0) / 2, y: (room.current?.clientHeight ?? 0) / 2 });
  const zoomBy = (f: number) => zoomAt(viewRef.current.k * f, center().x, center().y);

  return (
    <div className="pads">
      <section className="pads-me">
        <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <b>This device</b>
          <label className="check small" style={{ padding: 0 }}>
            <input type="checkbox" checked={me.on} onChange={(e) => void join(e.target.checked)} />
            <span>Show it in PADS</span>
          </label>
          <input className="input" style={{ maxWidth: 220 }} value={me.name} placeholder={myName()} onChange={(e) => setMe({ name: e.target.value })} aria-label="This device's name" />
          <select className="select" style={{ width: "auto" }} value={me.kind} onChange={(e) => setMe({ kind: e.target.value as Kind })} aria-label="What this device is">
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </div>
        <p className="small faint" style={{ margin: "4px 0 0" }}>
          PADS (Pandora's Atelier's Distributed Systems): every SEASIDE you're signed into{session ? ` as ${session}` : ""}, on devices where it's
          switched on, shows here. Arrange them the way they sit in your room. Next: your keyboard, mouse and controller cross from one to the next at
          their edges.
        </p>
      </section>

      <div
        ref={room}
        className="pads-room"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={(e) => !(e.target as Element).closest("[data-device], .pads-zoom") && fit()}
        onContextMenu={(e) =>
          openMenu(e, [
            { label: "Zoom in", hint: "pinch out", run: () => zoomBy(1.25) },
            { label: "Zoom out", hint: "pinch in", run: () => zoomBy(0.8) },
            { label: "Fit everything in", run: fit },
            { label: "Actual size", run: () => zoomAt(1, center().x, center().y) },
          ])
        }
      >
        <div className="pads-zoom" role="group" aria-label="Zoom">
          <button className="icon-btn" aria-label="Zoom out" data-tip="Zoom out (pinch in)" onClick={() => zoomBy(0.8)}>
            <ZoomOut size={15} />
          </button>
          <span className="small faint" style={{ minWidth: 38, textAlign: "center" }}>
            {Math.round(view.k * 100)}%
          </span>
          <button className="icon-btn" aria-label="Zoom in" data-tip="Zoom in (pinch out)" onClick={() => zoomBy(1.25)}>
            <ZoomIn size={15} />
          </button>
          <button className="icon-btn" aria-label="Fit everything in" data-tip="Fit everything in (double-click empty space)" onClick={fit}>
            <Maximize size={14} />
          </button>
        </div>
        {!devices.length ? (
          <div className="pads-empty small muted">
            {me.on ? "Looking for your devices…" : "Switch “Show it in PADS” on here, and on each device you want in it (each one asks first)."}
          </div>
        ) : null}
        <div className="pads-layer" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
        {devices.map((d) => {
          const p = at(d);
          const s = size(d);
          const Icon = ICON[d.kind] ?? Monitor;
          const sx = s.w / d.screen.w, sy = s.h / d.screen.h;
          return (
            <div
              key={d.id}
              className={`pads-card${d.here ? "" : " away"}${d.id === mine ? " mine" : ""}${drag?.id === d.id ? " dragging" : ""}`}
              data-device={d.id}
              style={{ left: p.x, top: p.y, width: s.w, height: s.h }}
              title={`${d.name} · ${KINDS.find((k) => k.id === d.kind)?.name} · ${d.browser} · ${d.screen.w}×${d.screen.h}${d.here ? "" : ` · away, last seen ${ago(d.seen)}`}`}
            >
              <div className="pads-screen">
                {d.state?.hangout ? (
                  <div className="pads-hangout">
                    <Sparkles size={14} /> Hangout
                  </div>
                ) : (
                  (d.state?.windows ?? []).map((w, i) => (
                    <div
                      key={i}
                      className={`pads-win${w.front ? " front" : ""}`}
                      style={w.max || d.state?.phone ? { left: 0, top: 0, right: 0, bottom: 0 } : { left: w.x * sx, top: w.y * sy, width: Math.max(8, w.w * sx), height: Math.max(6, w.h * sy) }}
                    >
                      {w.front || w.max || d.state?.phone ? <span>{w.title}</span> : null}
                    </div>
                  ))
                )}
              </div>
              <div className="pads-label">
                <Icon size={12} />
                <span className="pads-name">{d.name}</span>
                <span className={`pads-dot${d.here ? " on" : ""}`} aria-label={d.here ? "here" : "away"} />
              </div>
              {d.state?.playing ? (
                <div className="pads-playing" title={d.state.playing}>
                  <Music2 size={10} /> {d.state.playing}
                </div>
              ) : null}
            </div>
          );
        })}
        </div>
      </div>

      {devices.length ? (
        <ul className="pads-list small">
          {devices.map((d) => (
            <li key={d.id}>
              <span className={`pads-dot${d.here ? " on" : ""}`} />
              <b>{d.name}</b>
              <span className="faint">
                {KINDS.find((k) => k.id === d.kind)?.name} · {d.browser} · {d.here ? "here" : `away, last seen ${ago(d.seen)}`}
                {d.id === mine ? " · this device" : ""}
              </span>
              <span style={{ flex: 1 }} />
              {d.id !== mine ? (
                <button
                  className="btn small ghost"
                  onClick={() =>
                    void askUser(`Forget ${d.name}?`, "Its card leaves PADS. If PADS is still on there, it shows up again the next time it reports in.", "Forget it", "Keep it").then(
                      (yes) => yes && void padsApi.forget(d.id).then(() => setDevices((ds) => ds.filter((x) => x.id !== d.id))),
                    )
                  }
                >
                  Forget
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {!session ? <p className="small faint" style={{ margin: "6px 10px" }}>Tip: sign into the same account on each device (Settings → Accounts) so they all show here together.</p> : null}
    </div>
  );
}
