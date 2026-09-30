import { describe, expect, it } from 'vitest'
import { FOREVER_UNLOCK_AT } from '../../config'
import { WORLDS_MOCK } from './worldsMock'
import { findWorld, isWorldLocked, useWorlds } from './useWorlds'

const LAYOUTS = ['polaroid', 'filmstrip', 'postcards', 'memorywall', 'envelope', 'constellation']

describe('worlds mock (shape of the future GET /api/worlds)', () => {
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

  it('locks only "Our Forever", and takes its date from the single config constant', () => {
    const locked = WORLDS_MOCK.filter((w) => w.locked)
    expect(locked.map((w) => w.slug)).toEqual(['our-forever'])
    expect(locked[0]!.unlockAt).toBe(FOREVER_UNLOCK_AT)
  })

  it('keeps "Our Forever" last so it is the far end of the honeycomb', () => {
    expect(WORLDS_MOCK.at(-1)!.slug).toBe('our-forever')
  })
})

describe('useWorlds helpers', () => {
  it('useWorlds returns the mock list until the API is wired', () => {
    expect(useWorlds()).toBe(WORLDS_MOCK)
  })

  it('findWorld resolves by slug and returns undefined otherwise', () => {
    expect(findWorld('our-firsts')?.id).toBe(2)
    expect(findWorld('nope')).toBeUndefined()
    expect(findWorld(undefined)).toBeUndefined()
  })

  it('isWorldLocked flips exactly at the unlock instant', () => {
    const forever = findWorld('our-forever')!
    const at = new Date(FOREVER_UNLOCK_AT).getTime()
    expect(isWorldLocked(forever, at - 1)).toBe(true)
    expect(isWorldLocked(forever, at)).toBe(false)
    expect(isWorldLocked(forever, at + 86_400_000)).toBe(false)
  })

  it('never locks an ordinary world, nor one flagged locked without a date', () => {
    expect(isWorldLocked(findWorld('our-firsts')!, 0)).toBe(false)
    expect(isWorldLocked({ ...findWorld('our-forever')!, unlockAt: null }, 0)).toBe(false)
  })
})
