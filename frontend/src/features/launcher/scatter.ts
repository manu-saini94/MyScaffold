/**
 * Deterministic scattered placement for the home orbs: a jittered grid with seeded holes.
 * Every orb stays inside its own grid cell (minus half the gap on each side), so orbs can never overlap, and the
 * same set of slugs always produces the same picture for a given field size.
 */

export interface Orb {
  key: string
  /** Centre, in px from the field's top-left. */
  x: number
  y: number
  r: number
  /** Grid slot index (row-major). */
  slot: number
}

export interface Scatter {
  orbs: Orb[]
  /** Field height actually used: grows past the given height (so the field scrolls) when space is too tight. */
  height: number
  cols: number
  rows: number
}

export interface ScatterOptions {
  /** Smallest cell edge before the field grows taller instead. */
  minCell?: number
  maxRadius?: number
  /** Minimum clear space between two orbs. */
  gap?: number
}

/** FNV-1a, 32-bit. */
export function hashString(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

/** Small seeded PRNG in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function grid(slots: number, width: number, height: number, minCell: number) {
  const maxCols = Math.max(1, Math.floor(width / minCell))
  const cols = Math.min(maxCols, slots, Math.max(1, Math.round(Math.sqrt((slots * width) / height))))
  const rows = Math.ceil(slots / cols)
  return { cols, rows, cellW: width / cols, cellH: height / rows }
}

/**
 * Which grid slots host an orb. Columns are visited in a seeded order and each takes one orb in its emptiest row,
 * so every column is used before any column gets a second orb and rows stay balanced: the holes spread across the
 * page instead of collecting on one side. Returned ascending (reading order), so chapter order follows the rows.
 */
function pickSlots(n: number, cols: number, rows: number, rand: () => number): number[] {
  const order = Array.from({ length: cols }, (_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[order[i], order[j]] = [order[j]!, order[i]!]
  }
  const colRank = new Array<number>(cols)
  order.forEach((col, i) => (colRank[col] = i))
  const taken = new Set<number>()
  const perRow = new Array<number>(rows).fill(0)
  const perCol = new Array<number>(cols).fill(0)
  while (taken.size < n) {
    // emptiest column first, then emptiest row, then the seeded column order; a seeded fraction breaks row ties
    let best = -1
    let bestScore = Infinity
    for (let slot = 0; slot < cols * rows; slot++) {
      if (taken.has(slot)) continue
      const c = slot % cols
      const r = Math.floor(slot / cols)
      const score = perCol[c]! * 1e6 + perRow[r]! * 1e3 + colRank[c]! + rand() * 0.5
      if (score < bestScore) {
        bestScore = score
        best = slot
      }
    }
    taken.add(best)
    perCol[best % cols]!++
    perRow[Math.floor(best / cols)]!++
  }
  return [...taken].sort((a, b) => a - b)
}

export function scatterOrbs(
  keys: readonly string[],
  width: number,
  height: number,
  { minCell = 150, maxRadius = 128, gap = 14 }: ScatterOptions = {},
): Scatter {
  const n = keys.length
  if (n === 0 || width <= 0) return { orbs: [], height: Math.max(0, height), cols: 0, rows: 0 }
  const h0 = Math.max(height, minCell)
  const rand = mulberry32(hashString(keys.join('|')))

  // Try a roomy grid (about 40% empty slots, so it reads as scattered), then a tight one, then grow taller.
  let g = grid(n + Math.ceil(n * 0.4), width, h0, minCell)
  if (g.cellH < minCell) g = grid(n, width, h0, minCell)
  let fieldH = h0
  if (g.cellH < minCell) {
    fieldH = g.rows * minCell
    g = { ...g, cellH: minCell }
  }
  const { cols, rows, cellH } = g
  // Three or more columns: brick-stagger the rows (odd rows shift half a cell) so no straight grid lines show.
  const brick = cols >= 3 && rows > 1
  const cellW = brick ? width / (cols + 0.5) : g.cellW

  const chosen = pickSlots(n, cols, rows, rand)

  const base = Math.min(cellW, cellH) / 2 - gap / 2
  const orbs = chosen.map((slot, i) => {
    const row = Math.floor(slot / cols)
    const r = Math.max(8, Math.min(maxRadius, base * (0.66 + rand() * 0.32)))
    const freeX = Math.max(0, cellW / 2 - gap / 2 - r)
    const freeY = Math.max(0, cellH / 2 - gap / 2 - r)
    const cx = (slot % cols) * cellW + cellW / 2 + (brick && row % 2 === 1 ? cellW / 2 : 0)
    const cy = row * cellH + cellH / 2
    // two columns: alternate rows lean opposite ways (a gentle meander); plus seeded jitter, the sum within [-1, 1]
    const lean = brick ? 0 : row % 2 === 0 ? -0.5 : 0.5
    return {
      key: keys[i]!,
      x: cx + (lean + (rand() * 2 - 1) * 0.5) * freeX,
      y: cy + (rand() * 2 - 1) * freeY,
      r,
      slot,
    }
  })
  return { orbs, height: fieldH, cols, rows }
}

export type Direction = 'left' | 'right' | 'up' | 'down'

const AXES: Record<Direction, readonly [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
}

/** Index of the nearest orb in a direction (off-axis distance counts double), or null when none lies that way. */
export function nearestInDirection(orbs: readonly Pick<Orb, 'x' | 'y'>[], from: number, dir: Direction): number | null {
  const o = orbs[from]
  if (!o) return null
  const [ax, ay] = AXES[dir]
  let best: number | null = null
  let bestScore = Infinity
  orbs.forEach((p, i) => {
    if (i === from) return
    const dx = p.x - o.x
    const dy = p.y - o.y
    const along = dx * ax + dy * ay
    if (along <= 1) return
    const across = Math.abs(dx * ay - dy * ax)
    const score = along + across * 2
    if (score < bestScore) {
      bestScore = score
      best = i
    }
  })
  return best
}
