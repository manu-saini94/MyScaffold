import { describe, expect, it } from 'vitest'
import type { ApiLayout, LockedWorldSummary, OpenWorldSummary, WorldSummary } from '../../types/api'
import { mapExperienceWorlds } from './mapExperience'

const open = (over: Partial<OpenWorldSummary> = {}): OpenWorldSummary => ({
  slug: 'our-firsts',
  title: 'Our Firsts',
  subtitle: 'First trips',
  layout: 'FILM_STRIP',
  themeAccent: '#d6304f',
  sortOrder: 1,
  locked: false,
  tagline: 'hi',
  momentCount: 12,
  cover: { mediaId: 'M1', width: 4000, height: 3000, lqip: null, dominantColor: '#a1b2c3' },
  previewMediaIds: ['M1', 'M2'],
  ...over,
})

const locked = (over: Partial<LockedWorldSummary> = {}): LockedWorldSummary => ({
  slug: 'our-forever',
  title: 'Our Forever',
  subtitle: null,
  layout: 'CONSTELLATION',
  themeAccent: '#e0455a',
  sortOrder: 2,
  locked: true,
  unlockAt: '2027-02-13T18:30:00Z',
  ...over,
})

describe('mapExperienceWorlds', () => {
  it('maps an open world', () => {
    const [w] = mapExperienceWorlds([open()])
    expect(w).toEqual({
      id: 'our-firsts',
      chapter: 1,
      slug: 'our-firsts',
      title: 'Our Firsts',
      subtitle: 'First trips',
      layout: 'filmstrip',
      tint: ['#a1b2c3', '#d6304f'],
      photoCount: 12,
      locked: false,
      unlockAt: null,
      cover: open().cover,
      previewMediaIds: ['M1', 'M2'],
    })
  })

  it('maps a locked world to a teaser: no count, cover or preview, server unlockAt', () => {
    const [w] = mapExperienceWorlds([locked()])
    expect(w).toMatchObject({
      locked: true,
      photoCount: 0,
      unlockAt: '2027-02-13T18:30:00Z',
      cover: null,
      previewMediaIds: [],
      subtitle: '',
      layout: 'constellation',
    })
  })

  it.each<[ApiLayout, string]>([
    ['POLAROID_TABLE', 'polaroid'],
    ['FILM_STRIP', 'filmstrip'],
    ['POSTCARDS', 'postcards'],
    ['MEMORY_WALL', 'memorywall'],
    ['ENVELOPE', 'envelope'],
    ['CONSTELLATION', 'constellation'],
  ])('maps layout %s to %s', (layout, expected) => {
    expect(mapExperienceWorlds([open({ layout })])[0]!.layout).toBe(expected)
  })

  it('falls back to a deterministic palette for null cover and null accent', () => {
    const a = mapExperienceWorlds([open({ cover: null, themeAccent: null })])[0]!
    const b = mapExperienceWorlds([open({ cover: null, themeAccent: null })])[0]!
    expect(a.cover).toBeNull()
    expect(a.tint).toEqual(b.tint)
    expect(a.tint.every((c) => /^#[0-9a-f]{6}$/i.test(c))).toBe(true)
  })

  it('rejects non-hex colours instead of passing them into CSS', () => {
    const cover = { mediaId: 'M', width: null, height: null, lqip: null, dominantColor: 'url(x)' }
    const w = mapExperienceWorlds([open({ themeAccent: 'red;}body{x:y', cover })])[0]!
    expect(w.tint.every((c) => /^#[0-9a-f]{6}$/i.test(c))).toBe(true)
  })

  it('an unknown layout does not throw and becomes polaroid', () => {
    expect(mapExperienceWorlds([open({ layout: 'HOLOGRAM' as ApiLayout })])[0]!.layout).toBe('polaroid')
    expect(mapExperienceWorlds([open({ layout: 'toString' as ApiLayout })])[0]!.layout).toBe('polaroid')
  })

  it('orders by sortOrder and numbers chapters, without mutating the input', () => {
    const input: WorldSummary[] = [locked({ sortOrder: 5 }), open({ sortOrder: 2 })]
    const out = mapExperienceWorlds(input)
    expect(out.map((w) => [w.slug, w.chapter])).toEqual([
      ['our-firsts', 1],
      ['our-forever', 2],
    ])
    expect(input[0]!.slug).toBe('our-forever')
  })

  it('returns an empty list for no worlds', () => {
    expect(mapExperienceWorlds([])).toEqual([])
  })
})
