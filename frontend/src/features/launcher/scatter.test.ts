import { describe, expect, it } from 'vitest'
import { hashString, mulberry32, nearestInDirection, scatterOrbs, type Orb } from './scatter'

const SIX = ['where-it-all-began', 'our-firsts', 'adventures-together', 'little-everyday-moments', 'the-question', 'our-forever']
const GAP = 14

function noOverlap(orbs: readonly Orb[], gap = GAP) {
  for (let i = 0; i < orbs.length; i++)
    for (let j = i + 1; j < orbs.length; j++) {
      const a = orbs[i]!
      const b = orbs[j]!
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.r + b.r + gap - 1e-9)
    }
}

function inside(orbs: readonly Orb[], w: number, h: number) {
  for (const o of orbs) {
    expect(o.x - o.r).toBeGreaterThanOrEqual(0)
    expect(o.y - o.r).toBeGreaterThanOrEqual(0)
    expect(o.x + o.r).toBeLessThanOrEqual(w)
    expect(o.y + o.r).toBeLessThanOrEqual(h)
  }
}

describe('seeded helpers', () => {
  it('hashString is stable and spreads', () => {
    expect(hashString('our-firsts')).toBe(hashString('our-firsts'))
    expect(hashString('a')).not.toBe(hashString('b'))
  })

  it('mulberry32 repeats for a seed and stays in [0, 1)', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const xs = Array.from({ length: 200 }, () => a())
    expect(xs).toEqual(Array.from({ length: 200 }, () => b()))
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true)
  })
})

describe('scatterOrbs', () => {
  it.each([
    [390, 560],
    [1440, 640],
    [768, 700],
    [320, 420],
  ])('places six orbs without overlap inside %ix%i', (w, h) => {
    const s = scatterOrbs(SIX, w, h)
    expect(s.orbs.map((o) => o.key)).toEqual(SIX)
    noOverlap(s.orbs)
    inside(s.orbs, w, s.height)
  })

  it('is deterministic per world set and changes when the set changes', () => {
    expect(scatterOrbs(SIX, 1440, 640)).toEqual(scatterOrbs(SIX, 1440, 640))
    const other = scatterOrbs([...SIX.slice(0, 5), 'a-new-world'], 1440, 640)
    expect(other.orbs.map((o) => [o.x, o.y])).not.toEqual(scatterOrbs(SIX, 1440, 640).orbs.map((o) => [o.x, o.y]))
  })

  it('uses fewer columns on a phone than on a desktop, and leaves empty slots so it reads as scattered', () => {
    const phone = scatterOrbs(SIX, 390, 560)
    const desk = scatterOrbs(SIX, 1440, 640)
    expect(phone.cols).toBeLessThanOrEqual(2)
    expect(desk.cols).toBeGreaterThan(phone.cols)
    expect(desk.cols * desk.rows).toBeGreaterThan(SIX.length)
  })

  it('spreads the empty slots: every column and every row holds an orb', () => {
    for (const [w, h] of [[1440, 640], [1024, 700], [390, 560]] as const) {
      const s = scatterOrbs(SIX, w, h)
      expect(new Set(s.orbs.map((o) => o.slot % s.cols)).size).toBe(Math.min(s.cols, SIX.length))
      expect(new Set(s.orbs.map((o) => Math.floor(o.slot / s.cols))).size).toBe(s.rows)
    }
  })

  it('keeps chapter order in reading order (slots ascend)', () => {
    const slots = scatterOrbs(SIX, 1440, 640).orbs.map((o) => o.slot)
    expect([...slots].sort((a, b) => a - b)).toEqual(slots)
  })

  it('caps the radius on big screens', () => {
    expect(Math.max(...scatterOrbs(SIX, 2560, 1400).orbs.map((o) => o.r))).toBeLessThanOrEqual(128)
  })

  it('grows taller (scrolls) instead of shrinking orbs below the minimum cell', () => {
    const many = Array.from({ length: 14 }, (_, i) => `world-${i}`)
    const s = scatterOrbs(many, 390, 500)
    expect(s.height).toBeGreaterThan(500)
    noOverlap(s.orbs)
    inside(s.orbs, 390, s.height)
  })

  it('handles empty input and a single world', () => {
    expect(scatterOrbs([], 390, 500).orbs).toEqual([])
    expect(scatterOrbs(SIX, 0, 500).orbs).toEqual([])
    const one = scatterOrbs(['solo'], 390, 500)
    expect(one.orbs).toHaveLength(1)
    inside(one.orbs, 390, one.height)
  })
})

describe('nearestInDirection', () => {
  const pts = [
    { x: 100, y: 100 },
    { x: 300, y: 110 },
    { x: 120, y: 300 },
    { x: 320, y: 320 },
  ]

  it('moves along the requested axis, preferring the closest in line', () => {
    expect(nearestInDirection(pts, 0, 'right')).toBe(1)
    expect(nearestInDirection(pts, 0, 'down')).toBe(2)
    expect(nearestInDirection(pts, 3, 'left')).toBe(2)
    expect(nearestInDirection(pts, 3, 'up')).toBe(1)
  })

  it('returns null at an edge or for a bad index', () => {
    expect(nearestInDirection(pts, 0, 'left')).toBeNull()
    expect(nearestInDirection(pts, 0, 'up')).toBeNull()
    expect(nearestInDirection(pts, 9, 'up')).toBeNull()
  })
})
