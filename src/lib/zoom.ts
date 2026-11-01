// SEASIDE's own zoom (Settings → interface size, or a pinch) is CSS zoom on the page. Pointer positions and
// element boxes come in screen pixels, while positions and sizes set in styles are in SEASIDE's own pixels, so
// anything that turns one into the other goes through here. Measured, not assumed: browsers have differed on this.

/** Screen pixels per SEASIDE pixel (1.5 at 150%). */
export function zoomFactor(): number {
  if (typeof document === "undefined" || !document.body) return 1;
  const b = document.body;
  const w = b.getBoundingClientRect().width;
  return b.offsetWidth > 0 && w > 0 ? w / b.offsetWidth : 1;
}

/** A distance or position in screen pixels (a pointer's, a box's), in SEASIDE's own pixels. */
export const toCss = (n: number) => n / zoomFactor();
/** The visible page's size in SEASIDE's own pixels. */
export const viewW = () => (typeof window === "undefined" ? 1440 : window.innerWidth / zoomFactor());
export const viewH = () => (typeof window === "undefined" ? 900 : window.innerHeight / zoomFactor());
