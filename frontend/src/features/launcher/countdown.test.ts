import { describe, expect, it } from 'vitest'
import { computeRemaining } from './countdown'

const S = 1000
const M = 60 * S
const H = 60 * M
const D = 24 * H

describe('computeRemaining', () => {
  it('splits the time left into days, hours, minutes and seconds', () => {
    expect(computeRemaining(2 * D + 3 * H + 4 * M + 5 * S, 0)).toEqual({
      days: 2,
      hours: 3,
      minutes: 4,
      seconds: 5,
      done: false,
    })
  })

  it('floors partial seconds (never shows more time than is left)', () => {
    expect(computeRemaining(1999, 0)).toMatchObject({ seconds: 1, done: false })
    expect(computeRemaining(999, 0)).toMatchObject({ seconds: 0, done: false })
  })

  it('reports done and zeros at or after the target', () => {
    const zero = { days: 0, hours: 0, minutes: 0, seconds: 0, done: true }
    expect(computeRemaining(1000, 1000)).toEqual(zero)
    expect(computeRemaining(1000, 5000)).toEqual(zero)
  })

  it('treats an invalid target as done rather than NaN', () => {
    expect(computeRemaining(new Date('nope').getTime(), 0)).toMatchObject({ days: 0, done: true })
  })

  it('handles more than a year of days', () => {
    expect(computeRemaining(400 * D, 0).days).toBe(400)
  })
})
