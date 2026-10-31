import { useRef, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { Maximize2, Minimize2, Minus, X } from "lucide-react";
import { useDesk, type AppId } from "../lib/store.ts";
import { openMenu } from "./ContextMenu.tsx";

type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const EDGES: Edge[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
const MIN_W = 260;
const MIN_H = 160;

export function Window({
  id,
  title,
  icon,
  extra,
  lead,
  front,
  children,
  bare,
}: {
  id: AppId;
  title: string;
  icon?: ReactNode;
  extra?: ReactNode;
  /** Controls placed before the title (a Back button). */
  lead?: ReactNode;
  front: boolean;
  children: ReactNode;
  /** No title bar: the app draws its own (games in play mode). */
  bare?: boolean;
}) {
  const win = useDesk((s) => s.wins[id]);
  const inHangout = useDesk((s) => s.hangout && s.hang.windows.includes(id));
  const { focusApp, moveApp, closeApp, minimizeApp, toggleMax } = useDesk.getState();
  const ref = useRef<HTMLDivElement>(null);

  const start = (e: RPointerEvent, mode: "move" | Edge) => {
    if (e.button !== 0) return;
    if (mode === "move" && (e.target as HTMLElement).closest("button, input, select, a")) return;
    if (mode === "move" && win.max) return;
    e.preventDefault();
    focusApp(id);
    const sx = e.clientX;
    const sy = e.clientY;
    const box = { x: win.x, y: win.y, w: win.w, h: win.h };
    const space = ref.current?.parentElement?.getBoundingClientRect();
    const maxW = space?.width ?? window.innerWidth;
    const maxH = space?.height ?? window.innerHeight;
    const el = ref.current;
    let next = { ...box };
    // While dragging, embedded pages (Vector, games, the browser) ignore the pointer, and the handle holds on to it:
    // otherwise a page under the pointer swallows the moves and the release, and the window keeps resizing.
    const handle = e.currentTarget as HTMLElement;
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    document.body.classList.add("dragging-window");
    // one update per screen frame: a heavy page inside (Vector's app) re-lays itself out on each one
    let frame = 0;
    const apply = () => {
      frame = 0;
      if (!el) return;
      el.style.left = `${next.x}px`;
      el.style.top = `${next.y}px`;
      el.style.width = `${next.w}px`;
      el.style.height = `${next.h}px`;
    };
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      next = { ...box };
      if (mode === "move") {
        next.x = Math.min(maxW - 80, Math.max(-box.w + 120, box.x + dx));
        next.y = Math.min(maxH - 36, Math.max(0, box.y + dy));
      } else {
        if (mode.includes("e")) next.w = Math.max(MIN_W, Math.min(maxW - box.x, box.w + dx));
        if (mode.includes("s")) next.h = Math.max(MIN_H, Math.min(maxH - box.y, box.h + dy));
        if (mode.includes("w")) {
          const w = Math.max(MIN_W, box.w - dx);
          next.x = box.x + (box.w - w);
          next.w = w;
        }
        if (mode.includes("n")) {
          const h = Math.max(MIN_H, box.h - dy);
          next.y = Math.max(0, box.y + (box.h - h));
          next.h = h;
        }
      }
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      handle.removeEventListener("lostpointercapture", onUp);
      if (frame) cancelAnimationFrame(frame);
      apply();
      document.body.style.userSelect = "";
      document.body.classList.remove("dragging-window");
      moveApp(id, next);
    };
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    handle.addEventListener("lostpointercapture", onUp);
  };

  if (!win.open) return null;
  return (
    <div
      ref={ref}
      className={`win${front ? " front" : ""}${win.min ? " min" : ""}${win.max ? " max" : ""}${inHangout ? " in-hangout" : ""}`}
      style={{ left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z }}
      onPointerDownCapture={() => focusApp(id)}
      role="dialog"
      aria-label={title}
    >
      {bare ? null : (
        <div
          className="titlebar"
          onContextMenu={(e) =>
            openMenu(e, [
              { heading: title },
              { label: "Minimize", run: () => minimizeApp(id) },
              { label: win.max ? "Restore" : "Maximize", run: () => toggleMax(id) },
              { label: "Tile all windows", run: () => useDesk.getState().arrange("tile") },
              { sep: true },
              { label: "Close", hint: "Alt Shift W", run: () => closeApp(id) },
            ])
          }
          onPointerDown={(e) => start(e, "move")} onDoubleClick={(e) => !(e.target as HTMLElement).closest("button") && toggleMax(id)}>
          {lead ?? icon}
          <span className="title">{title}</span>
          <div className="extra">{extra}</div>
          <div className="controls">
            <button aria-label="Minimize" data-tip="Minimize" onClick={() => minimizeApp(id)}>
              <Minus size={15} />
            </button>
            <button aria-label={win.max ? "Restore" : "Maximize"} data-tip={win.max ? "Restore" : "Maximize"} onClick={() => toggleMax(id)}>
              {win.max ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button className="close" aria-label="Close" data-tip="Close" onClick={() => closeApp(id)}>
              <X size={15} />
            </button>
          </div>
        </div>
      )}
      <div className="win-body">{children}</div>
      {EDGES.map((edge) => (
        <div key={edge} className={`resize ${edge}`} onPointerDown={(e) => start(e, edge)} />
      ))}
    </div>
  );
}
