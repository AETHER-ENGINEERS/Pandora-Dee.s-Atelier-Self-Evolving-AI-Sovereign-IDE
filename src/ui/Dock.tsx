import { useEffect, useRef, useState, type ReactNode } from "react";
import { GripVertical, MonitorPlay, Trees } from "lucide-react";
import { APPS, desk, useDesk, type AppId, type DockPrefs } from "../lib/store.ts";
import { ICONS, openSettings } from "./Desktop.tsx";
import { openMenu, type MenuItem } from "./ContextMenu.tsx";

type Edge = DockPrefs["edge"];

/** The space a floating dock may use: the screen, less a visible menu bar. */
function room() {
  const bar = document.querySelector(".menubar:not(.bar-hidden)")?.getBoundingClientRect();
  const auto = document.querySelector(".bar-auto");
  const h = window.innerHeight;
  if (!bar || auto) return { top: 4, bottom: h - 4 };
  return bar.top < h / 2 ? { top: bar.bottom + 4, bottom: h - 4 } : { top: 4, bottom: bar.top - 4 };
}

function labelOf(id: string) {
  if (id === "hangout") return "Hangout";
  if (id === "classic") return "Classic";
  return APPS.find((a) => a.id === id)?.title ?? id;
}

/** The app bar: on any edge, optionally hidden until called, with the apps you choose. */
export function Dock({ front }: { front?: AppId }) {
  const wins = useDesk((s) => s.wins);
  const d = useDesk((s) => s.dock);
  const swipe = useDesk((s) => s.touch.edgeSwipe);
  const [shown, setShown] = useState(!d.autoHide);
  const [dragEdge, setDragEdge] = useState<Edge | null>(null);
  // while dragging: where the dock is (it follows the pointer)
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const nav = useRef<HTMLElement>(null);
  const hideTimer = useRef(0);
  const floating = d.edge === "float" || Boolean(drag);
  const vertical = floating ? Boolean(d.float?.vertical) : d.edge === "left" || d.edge === "right";
  const autoHide = d.autoHide && d.edge !== "float";

  useEffect(() => setShown(!autoHide), [autoHide]);

  // A floating dock stays on screen when the window gets smaller.
  useEffect(() => {
    if (d.edge !== "float") return;
    const fit = () => {
      const r = nav.current?.getBoundingClientRect();
      const f = desk().dock.float;
      if (!r || !f) return;
      const x = Math.max(4, Math.min(f.x, window.innerWidth - r.width - 4));
      const { top, bottom } = room();
      const y = Math.max(top, Math.min(f.y, bottom - r.height));
      if (x !== f.x || y !== f.y) desk().set({ dock: { ...desk().dock, float: { ...f, x, y } } });
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [d.edge, d.float?.vertical, d.items.length, d.size, d.labels]);

  const reveal = () => {
    window.clearTimeout(hideTimer.current);
    setShown(true);
  };
  const conceal = () => {
    if (!d.autoHide || document.querySelector(".context-menu")) return;
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setShown(false), 700);
  };

  const click = (id: string) => {
    if (id === "hangout") return desk().set({ hangout: true });
    if (id === "classic") return desk().set({ classic: true });
    const w = desk().wins[id as AppId];
    if (w.open && !w.min && front === id && window.innerWidth >= 760) desk().minimizeApp(id as AppId);
    else desk().openApp(id as AppId);
  };

  // Drag the grip: the dock follows the pointer. Let go near an edge and it docks there;
  // anywhere else, it floats where you left it.
  const grip = (e: React.PointerEvent) => {
    e.preventDefault();
    const r = nav.current?.getBoundingClientRect();
    if (!r) return;
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    const SNAP = 48;
    const edgeNear = (x: number, y: number): Edge | null => {
      const dist = { left: x, right: window.innerWidth - x, top: y, bottom: window.innerHeight - y };
      const [edge, gap] = Object.entries(dist).sort((a, b) => a[1] - b[1])[0];
      return gap <= SNAP ? (edge as Edge) : null;
    };
    // on touch screens, clear of the side edges (swiping there is "back" on phones with gestures)
    const side = window.matchMedia("(pointer: coarse)").matches ? 28 : 4;
    const place = (ev: PointerEvent) => ({
      x: Math.max(side, Math.min(ev.clientX - dx, window.innerWidth - r.width - side)),
      y: Math.max(room().top, Math.min(ev.clientY - dy, room().bottom - r.height)),
    });
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 4) return;
      moved = true;
      setDrag(place(ev));
      setDragEdge(edgeNear(ev.clientX, ev.clientY));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDrag(null);
      setDragEdge(null);
      if (!moved) return;
      const edge = edgeNear(ev.clientX, ev.clientY);
      const cur = desk().dock;
      if (edge) desk().set({ dock: { ...cur, edge } });
      else desk().set({ dock: { ...cur, edge: "float", float: { ...place(ev), vertical: cur.edge === "float" ? Boolean(cur.float?.vertical) : cur.edge === "left" || cur.edge === "right" } } });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const at = drag ?? (d.edge === "float" ? d.float : undefined);
  const upTips = d.edge === "bottom" || (floating && (at?.y ?? 0) > window.innerHeight / 2);

  const icon = Math.round(d.size * 0.46);
  const button = (id: string, i: number): ReactNode => {
    if (id === "|") return <span key={`gap-${i}`} className="gap" />;
    const app = id as AppId;
    const running = id in wins && wins[app]?.open;
    return (
      <button
        key={`${id}-${i}`}
        className={`${running ? "running" : ""}${front === id ? " front" : ""}`}
        style={{ width: d.labels ? d.size + 18 : d.size, height: d.size + (d.labels ? 14 : 0) }}
        onClick={() => click(id)}
        onContextMenu={(e) => openMenu(e, itemMenu(id, i))}
        data-tip={d.labels ? undefined : labelOf(id)}
        data-tip-up={upTips ? "" : undefined}
        aria-label={labelOf(id)}
      >
        {id === "hangout" ? <Trees size={icon} /> : id === "classic" ? <MonitorPlay size={icon} /> : ICONS[app] ? ICONS[app](icon) : null}
        {d.labels ? <span className="dock-label">{labelOf(id)}</span> : null}
      </button>
    );
  };

  return (
    <>
      {autoHide ? (
        <div
          className={`dock-reveal ${d.edge}`}
          onPointerEnter={reveal}
          onTouchStart={() => swipe && reveal()}
          aria-hidden="true"
        />
      ) : null}
      <nav
        ref={nav}
        className={`dock ${floating ? "float" : d.edge}${vertical ? " vertical" : ""}${shown || floating ? "" : " hidden"}${drag ? " dragging" : ""}`}
        style={at ? { left: at.x, top: at.y } : undefined}
        aria-label="Apps"
        onPointerEnter={reveal}
        onPointerLeave={conceal}
        onContextMenu={(e) => openMenu(e, dockMenu(conceal))}
      >
        <span className="dock-grip" onPointerDown={grip} title="Drag to move the dock anywhere; let go near an edge to dock it there" aria-hidden="true">
          <GripVertical size={14} />
        </span>
        {d.items.map(button)}
      </nav>
      {dragEdge ? <div className={`dock-target ${dragEdge}`} /> : null}
    </>
  );
}

function dockMenu(conceal: () => void): MenuItem[] {
  const s = desk();
  const d = s.dock;
  const set = (p: Partial<DockPrefs>) => s.set({ dock: { ...desk().dock, ...p } });
  void conceal;
  return [
    { heading: "Dock" },
    ...(["bottom", "left", "right", "top"] as Edge[]).map((edge) => ({ label: `On the ${edge}`, checked: d.edge === edge, run: () => set({ edge }) }) as MenuItem),
    {
      label: "Floating (drag it anywhere)",
      checked: d.edge === "float",
      run: () => set({ edge: "float", float: d.float ?? { x: Math.max(4, window.innerWidth / 2 - 200), y: Math.max(40, window.innerHeight - 140), vertical: false } }),
    },
    ...(d.edge === "float" ? [{ label: "Upright", checked: Boolean(d.float?.vertical), run: () => set({ float: { x: d.float?.x ?? 40, y: d.float?.y ?? 40, vertical: !d.float?.vertical } }) } as MenuItem] : []),
    { sep: true },
    ...(d.edge === "float" ? [] : [{ label: "Hide until needed", checked: d.autoHide, run: () => set({ autoHide: !d.autoHide }) } as MenuItem]),
    { label: "Show names", checked: d.labels, run: () => set({ labels: !d.labels }) },
    { sep: true },
    { label: "Customize the dock…", run: () => openSettings("dock") },
    { label: "Settings…", run: () => openSettings() },
  ];
}

function itemMenu(id: string, index: number): MenuItem[] {
  const s = desk();
  const isApp = APPS.some((a) => a.id === id);
  const w = isApp ? s.wins[id as AppId] : undefined;
  const remove = () => s.set({ dock: { ...s.dock, items: s.dock.items.filter((_, i) => i !== index) } });
  return [
    { heading: labelOf(id) },
    ...(isApp
      ? ([
          { label: w?.open && !w.min ? "Bring to front" : "Open", run: () => s.openApp(id as AppId) },
          ...(w?.open ? [{ label: "Minimize", run: () => s.minimizeApp(id as AppId) }, { label: "Close", run: () => s.closeApp(id as AppId) }] : []),
        ] as MenuItem[])
      : [{ label: "Open", run: () => s.set(id === "hangout" ? { hangout: true } : { classic: true }) } as MenuItem]),
    { sep: true },
    { label: "Remove from the dock", run: remove },
    { label: "Customize the dock…", run: () => openSettings("dock") },
  ];
}
