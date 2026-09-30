import { describe, expect, it } from 'vitest'
import { axialToPixel, buildCells, fieldMetrics, neighbourInDirection, WIDE_BREAKPOINT } from './hexLayout'

describe('axialToPixel', () => {
  it('puts the origin at 0,0 and scales linearly with pitch', () => {
    expect(axialToPixel(0, 0, 100)).toEqual({ x: 0, y: 0 })
    expect(axialToPixel(1, 0, 100)).toEqual({ x: 100, y: 0 })
    const b = axialToPixel(0, 1, 100)
    expect(b.x).toBeCloseTo(50)
    expect(b.y).toBeCloseTo(86.6025, 3)
  })
})

describe('buildCells', () => {
  it.each([
    [0, 1],
    [1, 7],
    [2, 19],
  ])('%i rings give %i cells', (rings, count) => {
    expect(buildCells(rings, 100)).toHaveLength(count)
  })

  it('numbers cells 0..n-1 with the centre first and no duplicate coordinates', () => {
    const cells = buildCells(2, 100)
    expect(cells.map((c) => c.index)).toEqual([...cells.keys()])
    expect(cells[0]).toMatchObject({ q: 0, r: 0, x: 0, y: 0 })
    expect(new Set(cells.map((c) => `${c.q},${c.r}`)).size).toBe(19)
  })

  it('keeps every first-ring cell exactly one pitch from the centre (a true honeycomb)', () => {
    for (const c of buildCells(1, 120).slice(1)) expect(Math.hypot(c.x, c.y)).toBeCloseTo(120, 6)
  })

  it('never lets two cells overlap: minimum centre distance equals the pitch', () => {
    const cells = buildCells(2, 100)
    let min = Infinity
    for (const a of cells) for (const b of cells) if (a !== b) min = Math.min(min, Math.hypot(a.x - b.x, a.y - b.y))
    expect(min).toBeCloseTo(100, 6)
  })
})

describe('neighbourInDirection', () => {
  const cells = buildCells(1, 100)
  const all = () => true

  it('moves to the neighbour that lies in the requested direction', () => {
    expect(neighbourInDirection(cells, 0, 'right', all)).toBe(3) // axial (1,0)
    expect(cells[neighbourInDirection(cells, 0, 'down', all)!]!.y).toBeGreaterThan(0)
    expect(cells[neighbourInDirection(cells, 0, 'up', all)!]!.y).toBeLessThan(0)
    expect(cells[neighbourInDirection(cells, 0, 'left', all)!]!.x).toBeLessThan(0)
  })

  it('skips ineligible cells (ghosts) and returns null when nothing qualifies', () => {
    expect(neighbourInDirection(cells, 0, 'right', (i) => i !== 3)).not.toBe(3)
    expect(neighbourInDirection(cells, 3, 'right', all)).toBeNull() // nothing further right of the outer cell
    expect(neighbourInDirection(cells, 0, 'left', () => false)).toBeNull()
  })

  it('returns null for an unknown origin and never returns the origin itself', () => {
    expect(neighbourInDirection(cells, 99, 'up', all)).toBeNull()
    for (const dir of ['left', 'right', 'up', 'down'] as const) {
      expect(neighbourInDirection(cells, 0, dir, all)).not.toBe(0)
    }
  })

  it('rejects candidates outside the direction cone', () => {
    // From the cell at the right, "up" may pick an upper cell but never one that is mostly sideways.
    const up = neighbourInDirection(cells, 3, 'up', all)
    expect(up).not.toBeNull()
    const dx = Math.abs(cells[up!]!.x - cells[3]!.x)
    const dy = Math.abs(cells[up!]!.y - cells[3]!.y)
    expect(dx).toBeLessThanOrEqual(dy * 1.3)
  })
})

describe('fieldMetrics', () => {
  it('uses 1 ring (7 cells) below the wide breakpoint and 2 rings (19 cells) from it', () => {
    expect(fieldMetrics(WIDE_BREAKPOINT - 1, 800).rings).toBe(1)
    expect(fieldMetrics(WIDE_BREAKPOINT, 800).rings).toBe(2)
  })

  it('sizes the pitch from the smaller dimension and clamps it', () => {
    expect(fieldMetrics(690, 690).pitch).toBe(150) // 690 * 0.34 = 235, capped
    expect(fieldMetrics(390, 200).pitch).toBe(92) // floor
    expect(fieldMetrics(390, 800).pitch).toBeCloseTo(132.6, 6) // min(390, 800) * 0.34
    expect(fieldMetrics(1600, 2000).pitch).toBe(156) // wide cap
    expect(fieldMetrics(1280, 400).pitch).toBe(100) // wide floor
  })

  it('keeps icons smaller than the pitch and the fisheye radius past the outer ring', () => {
    for (const [w, h] of [[360, 640], [390, 844], [820, 1180], [1280, 800], [1920, 1080]] as const) {
      const m = fieldMetrics(w, h)
      expect(m.cellSize).toBeLessThan(m.pitch)
      expect(m.radius).toBeGreaterThan(m.pitch * m.rings)
    }
  })

  it('fits the whole 7-cell honeycomb inside a phone-sized field', () => {
    const w = 390
    const m = fieldMetrics(w, 560)
    expect(m.pitch + m.cellSize / 2).toBeLessThan(w / 2 + m.cellSize * 0.2)
  })
})
