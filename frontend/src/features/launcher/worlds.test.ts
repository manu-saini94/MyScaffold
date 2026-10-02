import { afterEach, describe, expect, it, vi } from 'vitest'
import { WORLDS_MOCK } from './worldsMock'
import { resetServerClock, serverNow, setServerClock } from '../../services/serverClock'
import { findWorld as find, isWorldLocked } from './useWorlds'

const findWorld = (slug: string | undefined) => find(WORLDS_MOCK, slug)

const LAYOUTS = ['polaroid', 'filmstrip', 'postcards', 'memorywall', 'envelope', 'constellation']

describe('worlds fixture (launcher-shaped)', () => {
  it('has the six chapters with unique ids and slugs', () => {
    expect(WORLDS_MOCK).toHaveLength(6)
    expect(new Set(WORLDS_MOCK.map((w) => w.id)).size).toBe(6)
    expect(new Set(WORLDS_MOCK.map((w) => w.slug)).size).toBe(6)
  })

  it.each(WORLDS_MOCK.map((w) => [w.slug, w] as const))('%s is well formed', (_slug, w) => {
    expect(w.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    expect(w.title.length).toBeGreaterThan(0)
    expect(LAYOUTS).toContain(w.layout)
    expect(w.tint.every((c) => /^#[0-9a-f]{6}$/i.test(c))).toBe(true)
    expect(w.photoCount).toBeGreaterThanOrEqual(0)
    // a world is locked exactly when it carries an unlock date
    expect(w.locked).toBe(w.unlockAt !== null)
    if (w.unlockAt) expect(Number.isNaN(new Date(w.unlockAt).getTime())).toBe(false)
  })

  it('locks only "Our Forever"', () => {
    expect(WORLDS_MOCK.filter((w) => w.locked).map((w) => w.slug)).toEqual(['our-forever'])
  })

  it('keeps "Our Forever" last so it is the far end of the honeycomb', () => {
    expect(WORLDS_MOCK.at(-1)!.slug).toBe('our-forever')
  })
})

describe('useWorlds helpers', () => {
  it('findWorld resolves by slug and returns undefined otherwise', () => {
    expect(findWorld('our-firsts')?.chapter).toBe(2)
    expect(findWorld('nope')).toBeUndefined()
    expect(findWorld(undefined)).toBeUndefined()
  })

  it('isWorldLocked follows the payload flag, not the device clock', () => {
    expect(isWorldLocked(findWorld('our-forever')!)).toBe(true)
    expect(isWorldLocked(findWorld('our-firsts')!)).toBe(false)
  })
})

describe('server clock', () => {
  afterEach(() => {
    resetServerClock()
    vi.useRealTimers()
  })

  it('serverNow follows the server, not a wrong device clock', () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000_000)
    setServerClock(new Date(10_000_000 - 86_400_000).toISOString(), Date.now()) // device is a day ahead
    expect(serverNow()).toBe(10_000_000 - 86_400_000)
    vi.setSystemTime(10_000_000 + 5000)
    expect(serverNow()).toBe(10_000_000 - 86_400_000 + 5000)
  })

  it('ignores an unparseable serverTime', () => {
    setServerClock('garbage')
    expect(Math.abs(serverNow() - Date.now())).toBeLessThan(50)
  })
})
