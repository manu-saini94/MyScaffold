export const CENTER_SCALE = 1.28
export const EDGE_SCALE = 0.22

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** Distance from viewport centre (px) to scale + opacity. Pure, allocation-free apart from the tuple. */
export function fisheye(dist: number, radius: number): { scale: number; opacity: number } {
  const t = clamp01(dist / radius)
  const scale = CENTER_SCALE - (CENTER_SCALE - EDGE_SCALE) * Math.pow(t, 1.3)
  const opacity = 1 - smooth(0.5, 1.02, t)
  return { scale, opacity }
}
