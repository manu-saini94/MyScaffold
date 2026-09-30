import { describe, expect, it } from 'vitest'
import { CENTER_SCALE, EDGE_SCALE, fisheye } from './fisheye'

describe('fisheye', () => {
  it('is largest and fully opaque at the centre', () => {
    expect(fisheye(0, 300)).toEqual({ scale: CENTER_SCALE, opacity: 1 })
  })

  it('shrinks to the edge scale and vanishes at the radius', () => {
    const edge = fisheye(300, 300)
    expect(edge.scale).toBeCloseTo(EDGE_SCALE, 6)
    expect(edge.opacity).toBeCloseTo(0, 1)
  })

  it('clamps beyond the radius instead of extrapolating', () => {
    expect(fisheye(9999, 300)).toEqual(fisheye(300, 300))
    expect(fisheye(-50, 300).scale).toBe(CENTER_SCALE)
  })

  it('is monotonic: further from the centre is never bigger or more opaque', () => {
    let prev = fisheye(0, 300)
    for (let d = 10; d <= 320; d += 10) {
      const cur = fisheye(d, 300)
      expect(cur.scale).toBeLessThanOrEqual(prev.scale)
      expect(cur.opacity).toBeLessThanOrEqual(prev.opacity)
      prev = cur
    }
  })

  it('keeps icons fully opaque through the first half of the radius', () => {
    expect(fisheye(150, 300).opacity).toBe(1)
  })
})
