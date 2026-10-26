import { useEffect, useRef, useState } from "react";

/**
 * Shows `data-tip` text for whatever the pointer is over, kept inside the window:
 * below the element (above with `data-tip-up`, or when there's no room), slid sideways
 * away from the edges, and wrapped when it's long.
 */
export function TooltipHost() {
  const [tip, setTip] = useState<{ text: string; el: Element; up: boolean } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer = 0;
    const over = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-tip]");
      window.clearTimeout(timer);
      if (!el) return setTip(null);
      const text = el.getAttribute("data-tip") ?? "";
      if (!text) return setTip(null);
      if (e.pointerType !== "mouse") return;
      timer = window.setTimeout(() => (setPos(null), setTip({ text, el, up: el.hasAttribute("data-tip-up") })), 250);
    };
    const hide = () => (window.clearTimeout(timer), setTip(null));
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("wheel", hide, { passive: true, capture: true });
    window.addEventListener("blur", hide);
    window.addEventListener("keydown", hide);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("wheel", hide, { capture: true });
      window.removeEventListener("blur", hide);
      window.removeEventListener("keydown", hide);
    };
  }, []);

  // Place it once it has a size.
  useEffect(() => {
    if (!tip || !box.current) return setPos(null);
    if (!tip.el.isConnected) return setTip(null);
    const r = tip.el.getBoundingClientRect();
    const b = box.current.getBoundingClientRect();
    const gap = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(gap, Math.min(vw - b.width - gap, r.left + r.width / 2 - b.width / 2));
    const below = r.bottom + 6;
    const above = r.top - b.height - 6;
    let top = tip.up ? above : below;
    if (top + b.height > vh - gap) top = above;
    if (top < gap) top = below + b.height > vh - gap ? gap : below;
    setPos({ left, top });
  }, [tip]);

  if (!tip) return null;
  return (
    <div ref={box} className="tooltip" role="tooltip" style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: "hidden" }}>
      {tip.text}
    </div>
  );
}
