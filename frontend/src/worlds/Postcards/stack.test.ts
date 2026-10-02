import { describe, expect, it } from 'vitest'
import { initStack, isDone, longDate, position, postmarkDate, stackReducer, swipeDecision, tiltFor } from './stack'

describe('stackReducer', () => {
  it('sends cards away one by one until the deck is done', () => {
    let s = initStack(2)
    expect(position(s)).toBe(1)
    s = stackReducer(s, { type: 'next', dir: -1 })
    expect(s).toMatchObject({ top: 1, dir: -1, last: 'next' })
    expect(position(s)).toBe(2)
    s = stackReducer(s, { type: 'next', dir: 1 })
    expect(isDone(s)).toBe(true)
    expect(position(s)).toBe(2)
    expect(stackReducer(s, { type: 'next', dir: 1 })).toBe(s)
    expect(stackReducer(s, { type: 'flip' })).toBe(s)
  })

  it('flips the top card and resets the flip when the card changes', () => {
    let s = stackReducer(initStack(3), { type: 'flip' })
    expect(s.flipped).toBe(true)
    s = stackReducer(s, { type: 'next', dir: 1 })
    expect(s.flipped).toBe(false)
    s = stackReducer(stackReducer(s, { type: 'flip' }), { type: 'back' })
    expect(s).toMatchObject({ top: 0, flipped: false, last: 'back' })
    expect(stackReducer(s, { type: 'back' })).toBe(s)
  })

  it('shuffles back to a full deck', () => {
    let s = initStack(2)
    s = stackReducer(stackReducer(s, { type: 'next', dir: 1 }), { type: 'next', dir: 1 })
    s = stackReducer(s, { type: 'shuffle' })
    expect(s).toMatchObject({ top: 0, flipped: false, last: 'shuffle' })
    expect(isDone(s)).toBe(false)
  })

  it('treats an empty deck as done', () => {
    expect(isDone(initStack(0))).toBe(true)
    expect(position(initStack(0))).toBe(0)
  })
})

describe('swipeDecision', () => {
  it('needs distance or a flick in the same direction', () => {
    expect(swipeDecision(150, 0, 400)).toBe(1)
    expect(swipeDecision(-150, 0, 400)).toBe(-1)
    expect(swipeDecision(40, 0, 400)).toBeNull()
    expect(swipeDecision(30, 900, 400)).toBe(1)
    expect(swipeDecision(-30, -900, 400)).toBe(-1)
    expect(swipeDecision(30, -900, 400)).toBeNull()
    expect(swipeDecision(5, 2000, 400)).toBeNull()
  })
})

describe('tiltFor', () => {
  it('is stable and small', () => {
    expect(tiltFor('a')).toBe(tiltFor('a'))
    for (const id of ['a', 'b', '01KMOMENT1', 'zzzz']) expect(Math.abs(tiltFor(id))).toBeLessThanOrEqual(4)
  })
})

describe('dates', () => {
  it('formats postmark and long dates, rejecting junk', () => {
    expect(postmarkDate('2019-03-02')).toBe('02 MAR 2019')
    expect(postmarkDate('2019-13-02')).toBeNull()
    expect(postmarkDate(null)).toBeNull()
    expect(longDate('2019-03-02')).toBe('2 March 2019')
    expect(longDate('soon')).toBeNull()
  })
})
