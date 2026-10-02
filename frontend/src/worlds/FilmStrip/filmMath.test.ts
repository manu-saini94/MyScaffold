import { describe, expect, it } from 'vitest'
import { activeFrame, dateStamp, frameAspect, frameNumber, offsetForFrame, stripTravel } from './filmMath'

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

describe('activeFrame', () => {
  it('maps progress onto frame indices', () => {
    expect(activeFrame(0, 14)).toBe(0)
    expect(activeFrame(0.5, 5)).toBe(2)
    expect(activeFrame(1, 14)).toBe(13)
  })

  it('clamps bad input and tiny strips', () => {
    expect(activeFrame(-1, 5)).toBe(0)
    expect(activeFrame(7, 5)).toBe(4)
    expect(activeFrame(Number.NaN, 5)).toBe(0)
    expect(activeFrame(0.7, 1)).toBe(0)
    expect(activeFrame(0.7, 0)).toBe(0)
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
