/** Pure helpers for the memory wall: masonry placement, seeded tape/pin decoration and parallax depth. */

/** FNV-1a 32-bit hash: a stable seed from a moment id. */
export function hashId(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Deterministic number in [0, 1) for an id and a salt (different salts give independent-looking values). */
export function seeded(id: string, salt: number): number {
  let h = hashId(id) ^ Math.imul(salt + 1, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export type Fastener = 'tape' | 'corners' | 'pin'

export interface Decoration {
  fastener: Fastener
  /** Tape angle in degrees. */
  tapeAngle: number
  /** Sideways shift of a single tape strip, % of the photo width. */
  tapeShift: number
  /** Washi pattern variant. */
  pattern: 0 | 1 | 2
  /** Tilt of the print on the wall, degrees. */
  tilt: number
  /** Print width, % of its column. */
  width: number
  /** Where the spare column width goes: 0 = all on the right, 1 = all on the left. */
  offset: number
}

const between = (u: number, lo: number, hi: number) => Math.round((lo + u * (hi - lo)) * 10) / 10

/** How a photo is stuck to the wall: same id, same look, every visit. */
export function decorationFor(id: string): Decoration {
  const kind = seeded(id, 0)
  const fastener: Fastener = kind < 0.55 ? 'tape' : kind < 0.8 ? 'corners' : 'pin'
  return {
    fastener,
    tapeAngle: between(seeded(id, 1), -9, 9),
    tapeShift: between(seeded(id, 2), -18, 18),
    pattern: Math.floor(seeded(id, 3) * 3) as 0 | 1 | 2,
    tilt: between(seeded(id, 4), -2.4, 2.4),
    width: between(seeded(id, 5), 86, 100),
    offset: between(seeded(id, 6), 0, 1),
  }
}

/** Columns for a wall `width` px wide, never more than there are photos. */
export function columnCount(width: number, items: number): number {
  const cols = width >= 1100 ? 4 : width >= 560 ? 3 : 2
  return Math.max(1, Math.min(cols, items))
}

/**
 * Greedy masonry: each photo goes to the currently shortest column (leftmost on ties), so the wall reads roughly
 * left to right, top to bottom. `aspects` are width / height; `extra` is the caption strip in photo-width units.
 * Returns the photo indices of each column, top to bottom.
 */
export function masonry(aspects: readonly number[], columns: number, extra = 0.16): number[][] {
  const cols = Math.max(1, Math.floor(columns))
  const heights = new Array<number>(cols).fill(0)
  const placed: number[][] = Array.from({ length: cols }, () => [])
  aspects.forEach((aspect, i) => {
    const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
    let target = 0
    for (let c = 1; c < cols; c++) if ((heights[c] ?? 0) < (heights[target] ?? 0) - 1e-9) target = c
    placed[target]?.push(i)
    heights[target] = (heights[target] ?? 0) + 1 / ratio + extra
  })
  return placed
}

const DEPTHS = [1, 0, 2, 1] as const

/** Parallax depth (0 near .. 2 far) of a column: neighbours never share a depth. */
export function columnDepth(column: number): number {
  return DEPTHS[((column % DEPTHS.length) + DEPTHS.length) % DEPTHS.length] ?? 1
}

/**
 * Vertical parallax shift (px) for a depth at scroll `progress` (0 = wall entering, 1 = wall leaving):
 * deeper columns travel further, centred so the wall is aligned halfway through.
 */
export function parallaxShift(depth: number, progress: number, amplitude: number): number {
  const p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0.5
  return Math.round((0.5 - p) * 2 * depth * amplitude * 10) / 10
}
