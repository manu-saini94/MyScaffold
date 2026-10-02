import { describe, expect, it } from 'vitest'
import { formatRemaining, remainingUntil } from './useUnlockCountdown'

describe('remainingUntil / formatRemaining', () => {
  it('splits the time left and formats it', () => {
    const r = remainingUntil(90_061_000, 0) // 1d 1h 1m 1s
    expect(r).toEqual({ days: 1, hours: 1, minutes: 1, seconds: 1, done: false })
    expect(formatRemaining(r)).toBe('1d 01:01:01')
    expect(formatRemaining(remainingUntil(5_000, 0))).toBe('00:00:05')
  })

  it('is done at or past the target, and for an invalid target', () => {
    expect(remainingUntil(1000, 1000).done).toBe(true)
    expect(remainingUntil(1000, 5000).done).toBe(true)
    expect(remainingUntil(Number.NaN, 0).done).toBe(true)
  })
})
