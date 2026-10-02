// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import reducer, {
  chooseProfile,
  selectProfile,
  selectSessionStatus,
  sessionLost,
  statusResolved,
  unlocked,
} from './sessionSlice'

const init = () => reducer(undefined, { type: '@@init' })

beforeEach(() => sessionStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('sessionSlice', () => {
  it('starts unknown without a profile', () => {
    expect(init()).toEqual({ status: 'unknown', profile: null })
  })

  it('statusResolved maps the boolean to a status', () => {
    expect(reducer(init(), statusResolved(true)).status).toBe('unlocked')
    expect(reducer(init(), statusResolved(false)).status).toBe('locked')
  })

  it('statusResolved(false) forgets a stored profile', () => {
    const s = reducer(reducer(init(), chooseProfile('her')), statusResolved(false))
    expect(s.profile).toBeNull()
    expect(sessionStorage.getItem('our-story-profile')).toBeNull()
  })

  it('unlocked keeps the profile; sessionLost clears status and profile', () => {
    let s = reducer(init(), chooseProfile('her'))
    s = reducer(s, unlocked())
    expect(s).toEqual({ status: 'unlocked', profile: 'her' })
    s = reducer(s, sessionLost())
    expect(s).toEqual({ status: 'locked', profile: null })
    expect(sessionStorage.getItem('our-story-profile')).toBeNull()
  })

  it('chooseProfile persists to sessionStorage and is restored on the next load', () => {
    reducer(init(), chooseProfile('her'))
    expect(sessionStorage.getItem('our-story-profile')).toBe('her')
    expect(init().profile).toBe('her')
  })

  it('ignores a junk stored profile', () => {
    sessionStorage.setItem('our-story-profile', 'admin')
    expect(init().profile).toBeNull()
  })

  it('survives storage that throws, keeping the in-memory choice', () => {
    const boom = () => {
      throw new Error('blocked')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(boom)
    expect(init().profile).toBeNull()
    const s = reducer(init(), chooseProfile('her'))
    expect(s.profile).toBe('her')
    expect(reducer(s, sessionLost()).profile).toBeNull()
  })

  it('selectors read the slice', () => {
    const state = { session: { status: 'unlocked' as const, profile: 'her' as const } }
    expect(selectSessionStatus(state)).toBe('unlocked')
    expect(selectProfile(state)).toBe('her')
  })
})
