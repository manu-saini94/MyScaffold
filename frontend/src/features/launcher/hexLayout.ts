export interface Cell {
  index: number
  q: number
  r: number
  /** Position relative to the field centre, in CSS px, before any fisheye scaling. */
  x: number
  y: number
}

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
]

/** Pointy-top hex packing: axial (q, r) to pixel. `pitch` is the centre-to-centre distance. */
export function axialToPixel(q: number, r: number, pitch: number): { x: number; y: number } {
  return { x: pitch * (q + r / 2), y: pitch * (Math.sqrt(3) / 2) * r }
}

/** Spiral order: centre, then each ring (standard axial ring walk, starting bottom-left). */
export function buildCells(rings: number, pitch: number): Cell[] {
  const coords: Array<[number, number]> = [[0, 0]]
  for (let k = 1; k <= rings; k++) {
    const start = DIRS[4]!
    let q = start[0] * k
    let r = start[1] * k
    for (let side = 0; side < 6; side++) {
      const d = DIRS[side]!
      for (let step = 0; step < k; step++) {
        coords.push([q, r])
        q += d[0]
        r += d[1]
      }
    }
  }
  return coords.map(([q, r], index) => ({ index, q, r, ...axialToPixel(q, r, pitch) }))
}

export type Direction = 'left' | 'right' | 'up' | 'down'

const VEC: Record<Direction, readonly [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
}

/** Best eligible cell in a direction: favours near cells that stay close to the requested axis. */
export function neighbourInDirection(
  cells: readonly Cell[],
  from: number,
  dir: Direction,
  eligible: (i: number) => boolean,
): number | null {
  const origin = cells[from]
  if (!origin) return null
  const [dx, dy] = VEC[dir]
  let best: number | null = null
  let bestScore = Infinity
  for (const c of cells) {
    if (c.index === from || !eligible(c.index)) continue
    const vx = c.x - origin.x
    const vy = c.y - origin.y
    const along = vx * dx + vy * dy
    if (along <= 1) continue
    const across = Math.abs(vx * dy - vy * dx)
    if (across > along * 1.3) continue // outside a ~105 degree cone
    const score = along + across * 1.6
    if (score < bestScore) {
      bestScore = score
      best = c.index
    }
  }
  return best
}
