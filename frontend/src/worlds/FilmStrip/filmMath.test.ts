import { describe, expect, it } from 'vitest'
import { dateStamp, frameAspect, frameNumber, nearestFrame, offsetForFrame, stripTravel } from './filmMath'

describe('frameAspect', () => {
  it('keeps ordinary shapes and clamps extremes', () => {
    expect(frameAspect(1200, 900)).toBeCloseTo(4 / 3)
    expect(frameAspect(4000, 1000)).toBe(1.6)
    expect(frameAspect(500, 2000)).toBe(0.68)
  })

  it('falls back to a 3:2 film frame without dimensions', () => {
    expect(frameAspect(null, 900)).toBe(1.5)
    expect(frameAspect(1200, 0)).toBe(1.5)
  })
})

describe('stripTravel', () => {
  it('is the overflow of the track, never negative', () => {
    expect(stripTravel(3000, 1440)).toBe(1560)
    expect(stripTravel(800, 1440)).toBe(0)
  })
})

describe('nearestFrame', () => {
  // frames of uneven width: centres at 100, 420, 700, 1100
  const centers = [100, 420, 700, 1100]

  it('picks the frame whose centre is nearest the viewport centre, not the one left of it', () => {
    expect(nearestFrame(centers, 600)).toBe(2) // 420 is left of centre but 700 is nearer
    expect(nearestFrame(centers, 500)).toBe(1)
    expect(nearestFrame(centers, 1000)).toBe(3)
  })

  it('clamps to the ends', () => {
    expect(nearestFrame(centers, -500)).toBe(0)
    expect(nearestFrame(centers, 9000)).toBe(3)
  })

  it('keeps the earlier frame on an exact tie, and handles empty or broken input', () => {
    expect(nearestFrame([0, 200], 100)).toBe(0)
    expect(nearestFrame([], 100)).toBe(0)
    expect(nearestFrame(centers, Number.NaN)).toBe(0)
  })
})

describe('offsetForFrame', () => {
  it('centres the frame inside the travel range', () => {
    expect(offsetForFrame(400, 1000, 800, 2000)).toBe(400 + 600)
    expect(offsetForFrame(400, 100, 800, 2000)).toBe(400)
    expect(offsetForFrame(400, 5000, 800, 2000)).toBe(2400)
  })
})

describe('frameNumber / dateStamp', () => {
  it('pads frame numbers', () => {
    expect(frameNumber(0)).toBe('01')
    expect(frameNumber(13)).toBe('14')
  })

  it('formats dates like a date-back camera', () => {
    expect(dateStamp('2019-03-02')).toBe("'19 03 02")
    expect(dateStamp('2024-10-02T18:30:00Z')).toBe("'24 10 02")
  })

  it('returns null for missing or broken dates', () => {
    expect(dateStamp(null)).toBeNull()
    expect(dateStamp('')).toBeNull()
    expect(dateStamp('yesterday')).toBeNull()
    expect(dateStamp('2019-13-02')).toBeNull()
  })
})
