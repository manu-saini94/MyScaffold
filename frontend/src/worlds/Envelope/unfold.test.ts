import { describe, expect, it } from 'vitest'
import { autoDelay, initialUnfold, keyMomentIndex, TIMING, unfoldReducer, type UnfoldAction, type UnfoldState } from './unfold'

const run = (state: UnfoldState, ...actions: UnfoldAction['type'][]) =>
  actions.reduce((s, type) => unfoldReducer(s, { type } as UnfoldAction), state)

describe('unfoldReducer', () => {
  it('walks sealed -> opening -> letter -> each photo -> done', () => {
    let s = initialUnfold(3)
    expect(run(s, 'advance')).toBe(s) // the seal has to be broken first
    s = run(s, 'open')
    expect(s.stage).toBe('opening')
    s = run(s, 'advance')
    expect(s.stage).toBe('letter')
    s = run(s, 'advance')
    expect(s).toMatchObject({ stage: 'photos', shown: 1 })
    s = run(s, 'advance', 'advance')
    expect(s).toMatchObject({ stage: 'photos', shown: 3 })
    s = run(s, 'advance')
    expect(s.stage).toBe('done')
    expect(run(s, 'advance', 'open')).toBe(s)
  })

  it('goes from the letter straight to done when there are no photos', () => {
    expect(run(initialUnfold(0), 'open', 'advance', 'advance').stage).toBe('done')
  })

  it('pauses and resumes', () => {
    const s = run(initialUnfold(2), 'pause')
    expect(s.playing).toBe(false)
    expect(run(s, 'pause')).toBe(s)
    expect(run(s, 'toggle').playing).toBe(true)
  })
})

describe('autoDelay', () => {
  it('always runs the opening, waits on sealed and done, and honours pause', () => {
    const opening = run(initialUnfold(2), 'open')
    expect(autoDelay(initialUnfold(2), TIMING)).toBeNull()
    expect(autoDelay(opening, TIMING)).toBe(TIMING.openMs)
    expect(autoDelay(run(opening, 'pause'), TIMING)).toBe(TIMING.openMs)
    expect(autoDelay(run(opening, 'advance'), TIMING)).toBe(TIMING.letterMs)
    expect(autoDelay(run(opening, 'advance', 'pause'), TIMING)).toBeNull()
    expect(autoDelay(run(opening, 'advance', 'advance'), TIMING)).toBe(TIMING.photoMs)
    expect(autoDelay(run(opening, 'advance', 'advance', 'advance'), TIMING)).toBe(TIMING.endMs)
    expect(autoDelay(run(opening, 'advance', 'advance', 'advance', 'advance'), TIMING)).toBeNull()
  })
})

describe('keyMomentIndex', () => {
  it('picks the first favourite, else the last moment, else -1', () => {
    expect(keyMomentIndex([{ favourite: false }, { favourite: true }, { favourite: true }])).toBe(1)
    expect(keyMomentIndex([{ favourite: false }, { favourite: false }])).toBe(1)
    expect(keyMomentIndex([])).toBe(-1)
  })
})
