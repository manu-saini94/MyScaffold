import { describe, expect, it } from 'vitest'
import { MAX_TILT, TABLE_PAD, bringToFront, formatDay, layoutTable, seededRandom } from './table'

const ids = Array.from({ length: 10 }, (_, i) => `01KMOMENT${i}`)

describe('seededRandom', () => {
  it('repeats for the same seed and differs between seeds', () => {
    const a = seededRandom('x')
    const b = seededRandom('x')
    const c = seededRandom('y')
    const seqA = [a(), a(), a()]
    expect([b(), b(), b()]).toEqual(seqA)
    expect([c(), c(), c()]).not.toEqual(seqA)
    for (const v of seqA) expect(v >= 0 && v < 1).toBe(true)
  })
})

describe('layoutTable', () => {
  it('is deterministic per id set', () => {
    expect(layoutTable(ids, 1100)).toEqual(layoutTable(ids, 1100))
  })

  it('keeps every card inside the table, tilted within bounds', () => {
    for (const width of [320, 390, 800, 1152]) {
      const t = layoutTable(ids, width)
      for (const c of t.cards) {
        expect(c.x).toBeGreaterThanOrEqual(TABLE_PAD)
        expect(c.x + t.cardWidth).toBeLessThanOrEqual(width - TABLE_PAD)
        expect(c.y).toBeGreaterThanOrEqual(TABLE_PAD)
        expect(c.y + t.cardHeight).toBeLessThanOrEqual(t.height)
        expect(Math.abs(c.rotate)).toBeLessThanOrEqual(MAX_TILT)
      }
    }
  })

  it('uses one zig-zag column on phones and several on desktop', () => {
    const phone = layoutTable(ids, 358)
    expect(phone.columns).toBe(1)
    const [first, second] = phone.cards
    expect(first?.x ?? 0).toBeLessThan(second?.x ?? 0)
    expect(layoutTable(ids, 1152).columns).toBeGreaterThanOrEqual(4)
  })

  it('handles no cards, one card and nonsense widths', () => {
    expect(layoutTable([], 900).cards).toEqual([])
    expect(layoutTable(['a'], 0).cards).toHaveLength(1)
    expect(layoutTable(['a'], Number.NaN).cardWidth).toBeGreaterThan(0)
  })
})

describe('bringToFront', () => {
  it('moves the id to the end without mutating', () => {
    const order = ['a', 'b', 'c']
    expect(bringToFront(order, 'a')).toEqual(['b', 'c', 'a'])
    expect(bringToFront(order, 'c')).toEqual(['a', 'b', 'c'])
    expect(order).toEqual(['a', 'b', 'c'])
  })
})

describe('formatDay', () => {
  it('formats ISO days and rejects junk', () => {
    expect(formatDay('2019-03-02')).toBe('2 March 2019')
    expect(formatDay(null)).toBeNull()
    expect(formatDay('March')).toBeNull()
  })
})
