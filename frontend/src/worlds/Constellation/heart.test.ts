import { describe, expect, it } from 'vitest'
import { arcPath, discover, HEART_ASPECT, heartPath, heartStars, isComplete, nextHint, pointAt, segments, skyStars } from './heart'

describe('heart geometry', () => {
  it('starts at the top cusp in the middle and reaches the tip at the bottom', () => {
    const cusp = pointAt(0)
    expect(cusp.x).toBeCloseTo(0.5, 5)
    const pts = Array.from({ length: 200 }, (_, i) => pointAt(i / 200))
    const lowest = pts.reduce((a, b) => (b.y > a.y ? b : a))
    expect(lowest.x).toBeCloseTo(0.5, 2)
    expect(lowest.y).toBeCloseTo(0.93, 2)
    expect(HEART_ASPECT).toBeGreaterThan(1)
  })

  it('stays inside the padded box and is symmetric', () => {
    for (let i = 0; i < 100; i++) {
      const p = pointAt(i / 100)
      expect(p.x).toBeGreaterThanOrEqual(0.069)
      expect(p.x).toBeLessThanOrEqual(0.931)
      expect(p.y).toBeGreaterThanOrEqual(0.069)
      expect(p.y).toBeLessThanOrEqual(0.931)
      const mirror = pointAt(1 - i / 100)
      expect(mirror.x).toBeCloseTo(1 - p.x, 3)
      expect(mirror.y).toBeCloseTo(p.y, 3)
    }
  })

  it('places stars evenly and deterministically', () => {
    expect(heartStars(0)).toEqual([])
    expect(heartStars(1)).toEqual([{ x: 0.5, y: 0.5, s: 0 }])
    const stars = heartStars(9)
    expect(stars).toHaveLength(9)
    expect(stars.map((s) => s.s)).toEqual(Array.from({ length: 9 }, (_, i) => i / 9))
    expect(heartStars(9)).toEqual(stars)
    // even arc spacing: neighbour chords stay similar (the chord over the sharp cusp is the shortest)
    const d = stars.map((a, i) => {
      const b = stars[(i + 1) % 9] ?? a
      return Math.hypot((b.x - a.x) * HEART_ASPECT, b.y - a.y)
    })
    expect(Math.max(...d) / Math.min(...d)).toBeLessThan(2)
  })

  it('draws arcs forwards and wraps past the cusp', () => {
    const p = arcPath(0.9, 0.1, 100, 100, 2)
    expect(p.startsWith('M')).toBe(true)
    expect(p.split('L')).toHaveLength(3)
    const mid = (p.split('L')[1] ?? '').split(' ').map(Number)
    expect(mid[0]).toBeCloseTo(50, 0) // halfway is the cusp
    expect(heartPath(100, 90).endsWith('Z')).toBe(true)
  })
})

describe('discovery', () => {
  it('marks stars, links heart neighbours and completes', () => {
    let found: readonly boolean[] = [false, false, false, false]
    expect(nextHint(found, null)).toBe(0)
    found = discover(found, 0)
    expect(discover(found, 0)).toBe(found)
    expect(discover(found, 9)).toBe(found)
    expect(segments(found)).toEqual([])
    found = discover(found, 1)
    expect(segments(found)).toEqual([[0, 1]])
    expect(nextHint(found, 1)).toBe(2)
    found = discover(found, 3)
    expect(segments(found)).toEqual([[0, 1], [3, 0]])
    expect(nextHint(found, 3)).toBe(2)
    expect(isComplete(found)).toBe(false)
    found = discover(found, 2)
    expect(isComplete(found)).toBe(true)
    expect(segments(found)).toHaveLength(4)
    expect(nextHint(found, 2)).toBeNull()
  })

  it('handles one and no stars', () => {
    expect(isComplete([])).toBe(false)
    expect(segments([true])).toEqual([])
    expect(isComplete(discover([false], 0))).toBe(true)
  })
})

describe('skyStars', () => {
  it('is deterministic per seed and within the unit box', () => {
    const a = skyStars(50, 7)
    expect(skyStars(50, 7)).toEqual(a)
    expect(skyStars(50, 8)).not.toEqual(a)
    for (const s of a) {
      expect(s.x).toBeGreaterThanOrEqual(0)
      expect(s.x).toBeLessThan(1)
      expect(s.a).toBeLessThanOrEqual(1)
    }
    expect(skyStars(-3, 1)).toEqual([])
  })
})
