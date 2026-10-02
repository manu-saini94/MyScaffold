import { describe, expect, it } from 'vitest'
import { columnCount, columnDepth, decorationFor, hashId, masonry, parallaxShift, seeded } from './wallMath'

const ids = Array.from({ length: 60 }, (_, i) => `01KMOMENT${String(i).padStart(17, '0')}`)

describe('seeding', () => {
  it('is stable per id and spread across [0, 1)', () => {
    expect(hashId('abc')).toBe(hashId('abc'))
    expect(hashId('abc')).not.toBe(hashId('abd'))
    const values = ids.map((id) => seeded(id, 1))
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true)
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.6)
    expect(seeded('x', 1)).not.toBe(seeded('x', 2))
  })
})

describe('decorationFor', () => {
  it('gives the same decoration for the same id', () => {
    const id = ids[3] ?? ''
    expect(decorationFor(id)).toEqual(decorationFor(id))
  })

  it('keeps angles, shifts and tilts in range and uses every fastener', () => {
    const all = ids.map(decorationFor)
    for (const d of all) {
      expect(Math.abs(d.tapeAngle)).toBeLessThanOrEqual(9)
      expect(Math.abs(d.tapeShift)).toBeLessThanOrEqual(18)
      expect(Math.abs(d.tilt)).toBeLessThanOrEqual(2.4)
      expect([0, 1, 2]).toContain(d.pattern)
      expect(d.width).toBeGreaterThanOrEqual(86)
      expect(d.width).toBeLessThanOrEqual(100)
      expect(d.offset).toBeGreaterThanOrEqual(0)
      expect(d.offset).toBeLessThanOrEqual(1)
    }
    expect(new Set(all.map((d) => d.fastener))).toEqual(new Set(['tape', 'corners', 'pin']))
  })
})

describe('columnCount', () => {
  it('follows the breakpoints and never exceeds the photos', () => {
    expect(columnCount(390, 14)).toBe(2)
    expect(columnCount(820, 14)).toBe(3)
    expect(columnCount(1440, 14)).toBe(4)
    expect(columnCount(1440, 1)).toBe(1)
    expect(columnCount(1440, 0)).toBe(1)
  })
})

describe('masonry', () => {
  it('fills the shortest column first, left on ties', () => {
    // 0: tall (h 2), 1: square (h 1), 2: square -> col 1, 3: -> col 1 is at 2 vs col 0 at 2 -> col 0
    expect(masonry([0.5, 1, 1, 1], 2, 0)).toEqual([[0, 3], [1, 2]])
  })

  it('places every index exactly once and copes with bad aspects', () => {
    const cols = masonry([1.5, Number.NaN, 0, 0.7, 2, 1], 3)
    expect(cols.flat().sort()).toEqual([0, 1, 2, 3, 4, 5])
    expect(masonry([], 3)).toEqual([[], [], []])
    expect(masonry([1, 1], 0)).toEqual([[0, 1]])
  })
})

describe('parallax', () => {
  it('alternates depths between neighbours', () => {
    for (let c = 0; c < 3; c++) expect(columnDepth(c)).not.toBe(columnDepth(c + 1))
    expect(new Set([0, 1, 2, 3].map(columnDepth))).toEqual(new Set([0, 1, 2]))
  })

  it('shifts deeper columns further and is zero halfway', () => {
    expect(parallaxShift(2, 0, 20)).toBe(40)
    expect(parallaxShift(1, 1, 20)).toBe(-20)
    expect(parallaxShift(2, 0.5, 20)).toBe(0)
    expect(parallaxShift(0, 0, 20)).toBe(0)
    expect(parallaxShift(1, Number.NaN, 20)).toBe(0)
  })
})
