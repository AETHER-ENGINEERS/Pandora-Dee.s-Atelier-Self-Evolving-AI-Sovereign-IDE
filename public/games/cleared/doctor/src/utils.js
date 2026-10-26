export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function pointToSegmentDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const vv = vx * vx + vy * vy;
  const t = vv === 0 ? 0 : (wx * vx + wy * vy) / vv;
  const tt = clamp(t, 0, 1);
  const cx = ax + tt * vx;
  const cy = ay + tt * vy;
  return Math.sqrt(dist2(px, py, cx, cy));
}

export function segmentsIntersectOrClose(ax, ay, bx, by, cx, cy, dx, dy, paddingPx = 0) {
  // Simple distance-to-segment based "touch" approximation for our use.
  // Checks if either segment endpoint is close to the other segment.
  const d1 = pointToSegmentDist(ax, ay, cx, cy, dx, dy);
  const d2 = pointToSegmentDist(bx, by, cx, cy, dx, dy);
  const d3 = pointToSegmentDist(cx, cy, ax, ay, bx, by);
  const d4 = pointToSegmentDist(dx, dy, ax, ay, bx, by);
  return Math.min(d1, d2, d3, d4) <= paddingPx;
}

export function normalizePoint(x, y, w, h) {
  return { x: w === 0 ? 0 : x / w, y: h === 0 ? 0 : y / h };
}

export function denormalizePoint(nx, ny, w, h) {
  return { x: nx * w, y: ny * h };
}

export function minDim(w, h) {
  return Math.min(w, h);
}