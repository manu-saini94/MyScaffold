/**
 * Geometry and state for the constellation: stars sit on the classic parametric heart
 *   x = 16 sin^3 t,  y = 13 cos t - 5 cos 2t - 2 cos 3t - cos 4t
 * spaced evenly by arc length, starting at the top cusp and running clockwise (right lobe, tip, left lobe).
 * Coordinates are normalised to 0..1 in a box of aspect HEART_ASPECT (width / height), y pointing down.
 */
export interface Point {
  x: number
  y: number
}

export interface HeartStar extends Point {
  /** Position along the outline, 0..1 (fraction of the arc length from the top cusp). */
  s: number
}

const SAMPLES = 720
/** Breathing room around the outline, as a fraction of each side. */
const PAD = 0.07

function raw(t: number): Point {
  const x = 16 * Math.sin(t) ** 3
  const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
  return { x, y }
}

const RAW = Array.from({ length: SAMPLES + 1 }, (_, i) => raw((i / SAMPLES) * Math.PI * 2))
const MIN_Y = Math.min(...RAW.map((p) => p.y))
const MAX_Y = Math.max(...RAW.map((p) => p.y))
const SPAN_X = 32
const SPAN_Y = MAX_Y - MIN_Y

/** Width / height of the heart's box (padding included). */
export const HEART_ASPECT = SPAN_X / SPAN_Y

const norm = (p: Point): Point => ({
  x: PAD + (1 - 2 * PAD) * ((p.x + 16) / SPAN_X),
  y: PAD + (1 - 2 * PAD) * ((MAX_Y - p.y) / SPAN_Y),
})

const OUTLINE = RAW.map(norm)

// cumulative arc length (x scaled by the aspect so both axes weigh the same)
const CUM = OUTLINE.reduce<number[]>((acc, p, i) => {
  const prev = OUTLINE[i - 1]
  acc.push(prev ? (acc[i - 1] ?? 0) + Math.hypot((p.x - prev.x) * HEART_ASPECT, p.y - prev.y) : 0)
  return acc
}, [])
const TOTAL = CUM[CUM.length - 1] ?? 1

/** The outline point at arc fraction `s` (wraps), linearly interpolated between samples. */
export function pointAt(s: number): Point {
  const target = (((s % 1) + 1) % 1) * TOTAL
  let lo = 0
  let hi = CUM.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if ((CUM[mid] ?? 0) <= target) lo = mid
    else hi = mid
  }
  const a = OUTLINE[lo] ?? { x: 0.5, y: 0.5 }
  const b = OUTLINE[hi] ?? a
  const ca = CUM[lo] ?? 0
  const f = (target - ca) / ((CUM[hi] ?? ca) - ca || 1)
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }
}

/** `n` stars evenly spaced along the outline from the top cusp; a single star sits in the middle of the heart. */
export function heartStars(n: number): HeartStar[] {
  if (n <= 0) return []
  if (n === 1) return [{ x: 0.5, y: 0.5, s: 0 }]
  return Array.from({ length: n }, (_, i) => {
    const s = i / n
    return { ...pointAt(s), s }
  })
}

/** SVG path following the outline from fraction `from` to `to` (forwards, wrapping), in a w x h viewBox. */
export function arcPath(from: number, to: number, w: number, h: number, steps = 32): string {
  let end = to
  while (end <= from) end += 1
  const pts: string[] = []
  for (let k = 0; k <= steps; k++) {
    const p = pointAt(from + ((end - from) * k) / steps)
    pts.push(`${(p.x * w).toFixed(1)} ${(p.y * h).toFixed(1)}`)
  }
  return `M${pts.join('L')}`
}

/** The whole outline as one closed path. */
export function heartPath(w: number, h: number): string {
  return `${arcPath(0, 1, w, h, 160)}Z`
}

// ---------- discovery ----------

/** Marks star `i` found; returns the same array when nothing changes. */
export function discover(found: readonly boolean[], i: number): readonly boolean[] {
  if (i < 0 || i >= found.length || found[i]) return found
  return found.map((f, k) => f || k === i)
}

export const isComplete = (found: readonly boolean[]): boolean => found.length > 0 && found.every(Boolean)

/** Gold segments: every pair of neighbours on the heart (the last wraps to the first) once both are found. */
export function segments(found: readonly boolean[]): [number, number][] {
  const n = found.length
  if (n < 2) return []
  const out: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    if (found[i] && found[j]) out.push([i, j])
  }
  return out
}

/** The star to hint at: the first one still dark in heart order after `last` (wrapping); null when all are found. */
export function nextHint(found: readonly boolean[], last: number | null): number | null {
  const n = found.length
  const start = last === null ? 0 : last + 1
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n
    if (!found[i]) return i
  }
  return null
}

// ---------- background sky ----------

export interface SkyStar extends Point {
  /** Radius in CSS px. */
  r: number
  /** Base brightness 0..1. */
  a: number
}

/** Deterministic pseudo-random star field (mulberry32), so the sky looks the same on every visit. */
export function skyStars(count: number, seed: number): SkyStar[] {
  let state = seed >>> 0
  const rand = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return Array.from({ length: Math.max(0, count) }, () => {
    const big = rand() > 0.9
    return { x: rand(), y: rand(), r: big ? 1.1 + rand() * 0.8 : 0.4 + rand() * 0.6, a: 0.35 + rand() * 0.65 }
  })
}
