import { describe, expect, it } from 'vitest'
import { attemptsNote, HINTS, pickHint } from './hints'

describe('pickHint', () => {
  it('is pure and never empty, for any input', () => {
    for (const n of [0, 1, 2, 7, 99, -3, 2.6, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(pickHint(n)).toBe(pickHint(n))
      expect(pickHint(n).trim().length).toBeGreaterThan(0)
    }
  })

  it('rotates: consecutive failures get different hints, and every hint is used', () => {
    const seen = Array.from({ length: HINTS.length }, (_, i) => pickHint(i))
    expect(new Set(seen).size).toBe(HINTS.length)
    for (let i = 0; i < 20; i++) expect(pickHint(i)).not.toBe(pickHint(i + 1))
  })
})

describe('attemptsNote', () => {
  it('stays quiet while plenty of attempts remain or the count is unknown', () => {
    expect(attemptsNote(undefined)).toBeNull()
    expect(attemptsNote(3)).toBeNull()
  })

  it('speaks softly at two, one and zero remaining', () => {
    expect(attemptsNote(2)).toMatch(/2 more tries/)
    expect(attemptsNote(1)).toMatch(/One more try/)
    expect(attemptsNote(0)).toMatch(/last try/)
  })
})
