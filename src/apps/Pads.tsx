import { useEffect, useRef, useState } from "react";
import { Gamepad2, Laptop, Monitor, Smartphone, Tablet, Tv, HelpCircle, Music2, Sparkles } from "lucide-react";
import { useDesk } from "../lib/store.ts";
import { askUser } from "../ui/Ask.tsx";
import { deviceId, KINDS, myName, padsApi, setMe, useMe, type Device, type Kind } from "../lib/pads.ts";

/** How big a device's card is: its screen, at this scale (so a phone is narrow and tall, a TV wide). */
const SCALE = 0.13;
const ICON: Record<Kind, typeof Monitor> = { desktop: Monitor, laptop: Laptop, mac: Laptop, phone: Smartphone, tablet: Tablet, console: Gamepad2, tv: Tv, handheld: Gamepad2, other: HelpCircle };
const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`;
};

/** PADS Manager: every SEASIDE of this account that joined PADS, arranged the way the devices sit in the room. */
export function PadsApp() {
  const me = useMe();
  const session = useDesk((s) => s.session);
  const [devices, setDevices] = useState<Device[]>([]);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; x: number; y: number } | null>(null);
  const room = useRef<HTMLDivElement>(null);
  const mine = deviceId();

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
  const minX = Math.min(0, ...devices.map((d) => at(d).x));
  const minY = Math.min(0, ...devices.map((d) => at(d).y));
  const pad = 28; // room for the names under the cards and the song above them

  const onDown = (e: React.PointerEvent, d: Device) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id: d.id, dx: e.clientX - d.layout.x, dy: e.clientY - d.layout.y, x: d.layout.x, y: d.layout.y });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    setDrag({ ...drag, x: Math.round(e.clientX - drag.dx), y: Math.round(e.clientY - drag.dy) });
  };
  const onUp = () => {
    if (!drag) return;
    const { id, x, y } = drag;
    setDevices((ds) => ds.map((d) => (d.id === id ? { ...d, layout: { x, y } } : d)));
    setDrag(null);
    void padsApi.arrange({ [id]: { x, y } });
  };

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

      <div ref={room} className="pads-room" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {!devices.length ? (
          <div className="pads-empty small muted">
            {me.on ? "Looking for your devices…" : "Switch “Show it in PADS” on here, and on each device you want in it (each one asks first)."}
          </div>
        ) : null}
        {devices.map((d) => {
          const p = at(d);
          const s = size(d);
          const Icon = ICON[d.kind] ?? Monitor;
          const sx = s.w / d.screen.w, sy = s.h / d.screen.h;
          return (
            <div
              key={d.id}
              className={`pads-card${d.here ? "" : " away"}${d.id === mine ? " mine" : ""}${drag?.id === d.id ? " dragging" : ""}`}
              style={{ left: p.x - minX + pad, top: p.y - minY + pad, width: s.w, height: s.h }}
              onPointerDown={(e) => onDown(e, d)}
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
