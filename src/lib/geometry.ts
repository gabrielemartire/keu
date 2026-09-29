export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Point where the segment from the rect center towards `toward` crosses the rect border. */
export function borderPoint(r: Rect, toward: { x: number; y: number }, pad = 0) {
  const cx = r.x + r.width / 2
  const cy = r.y + r.height / 2
  const dx = toward.x - cx
  const dy = toward.y - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const hw = r.width / 2 + pad
  const hh = r.height / 2 + pad
  const t = Math.min(dx !== 0 ? hw / Math.abs(dx) : Infinity, dy !== 0 ? hh / Math.abs(dy) : Infinity)
  return { x: cx + dx * t, y: cy + dy * t }
}

/** Floating edge between two rectangles: straight segment clipped to both borders. */
export function floatingSegment(a: Rect, b: Rect) {
  const ca = { x: a.x + a.width / 2, y: a.y + a.height / 2 }
  const cb = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  return { from: borderPoint(a, cb), to: borderPoint(b, ca) }
}
