import { describe, expect, it } from 'vitest'
import type { LockedWorldSummary, OpenWorldDetail, OpenWorldSummary } from '../../types/api'
import { kenBurns } from './kenBurns'
import { formatDay, formatRemaining } from './format'
import { buildChapters, nextOpenSlug, resolveChapter, slideAt, slideCount, type Chapter } from './playlist'
import {
  advanceIfDue,
  elapsedMs,
  isEnd,
  moveTo,
  nextChapterPos,
  nextPos,
  prevPos,
  setPlaying,
  startState,
  type Outline,
} from './storyMachine'
import {
  CHAR_MS,
  LOCKED_MS,
  MOMENT_MIN_MS,
  READ_MS,
  TITLE_MS,
  TYPE_DELAY_MS,
  captionChars,
  momentMs,
  slideDuration,
  typedCount,
  typingEndMs,
} from './timing'

const open = (slug: string, sortOrder: number): OpenWorldSummary => ({
  slug, title: slug, subtitle: null, layout: 'POLAROID_TABLE', themeAccent: null, sortOrder,
  locked: false, tagline: null, momentCount: 2, cover: null, previewMediaIds: [],
})
const locked = (slug: string, sortOrder: number): LockedWorldSummary => ({
  slug, title: slug, subtitle: null, layout: 'CONSTELLATION', themeAccent: null, sortOrder, locked: true, unlockAt: '2027-01-01T00:00:00Z',
})
const detail = (moments: number): OpenWorldDetail => ({
  slug: 'a', title: 'A', subtitle: null, tagline: null, layout: 'POLAROID_TABLE', themeAccent: null, locked: false,
  introText: null, outroText: null, musicUrl: null, nextSlug: null, serverTime: '2026-10-01T00:00:00Z', letters: [],
  moments: Array.from({ length: moments }, (_, i) => ({
    id: `m${i}`, sortOrder: i, caption: null, note: null, happenedOn: null, place: null, favourite: false,
    media: { mediaId: `x${i}`, mimeType: 'image/jpeg', width: 1, height: 1, lqip: null, dominantColor: null, takenAt: null },
  })),
})

describe('playlist', () => {
  it('orders chapters by sortOrder without touching the input', () => {
    const worlds = [open('c', 3), locked('b', 2), open('a', 1)]
    expect(buildChapters(worlds).map((c) => `${c.kind}:${c.slug}`)).toEqual(['open:a', 'locked:b', 'open:c'])
    expect(worlds[0]?.slug).toBe('c')
  })

  it('lets the detail overrule a stale summary', () => {
    const ch = buildChapters([open('a', 1)])[0]!
    expect(resolveChapter(ch, undefined, false)).toEqual({ kind: 'pending' })
    expect(resolveChapter(ch, undefined, true)).toEqual({ kind: 'missing' })
    expect(resolveChapter(ch, { slug: 'a', title: 'A', subtitle: null, layout: 'ENVELOPE', themeAccent: null, locked: true, unlockAt: 'u', serverTime: 's' }, false))
      .toEqual({ kind: 'locked', unlockAt: 'u' })
    expect(resolveChapter(buildChapters([locked('b', 1)])[0]!, undefined, false)).toEqual({ kind: 'locked', unlockAt: '2027-01-01T00:00:00Z' })
  })

  it('counts slides: title + moments, 1 for locked, 0 to skip, null while loading', () => {
    expect(slideCount({ kind: 'open', world: detail(3) })).toBe(4)
    expect(slideCount({ kind: 'locked', unlockAt: 'u' })).toBe(1)
    expect(slideCount({ kind: 'missing' })).toBe(0)
    expect(slideCount({ kind: 'pending' })).toBeNull()
  })

  it('finds the next open chapter to fetch ahead', () => {
    const chapters: Chapter[] = buildChapters([open('a', 1), locked('b', 2), open('c', 3)])
    expect(nextOpenSlug(chapters, 0)).toBe('c')
    expect(nextOpenSlug(chapters, 2)).toBeNull()
  })
})

describe('storyMachine', () => {
  const outline: Outline = [3, 1, 0, 2]

  it('banks time across a pause and ignores it while paused', () => {
    let s = startState(1000)
    expect(elapsedMs(s, 1500)).toBe(500)
    s = setPlaying(s, false, 1500)
    expect(elapsedMs(s, 9000)).toBe(500)
    s = setPlaying(s, true, 9000)
    expect(elapsedMs(s, 9200)).toBe(700)
    expect(setPlaying(s, true, 9300)).toBe(s)
  })

  it('steps forward through slides, skips empty chapters, ends on the final card', () => {
    expect(nextPos({ chapter: 0, slide: 1 }, outline)).toEqual({ chapter: 0, slide: 2 })
    expect(nextPos({ chapter: 0, slide: 2 }, outline)).toEqual({ chapter: 1, slide: 0 })
    expect(nextPos({ chapter: 1, slide: 0 }, outline)).toEqual({ chapter: 3, slide: 0 })
    const end = nextPos({ chapter: 3, slide: 1 }, outline)!
    expect(end).toEqual({ chapter: 4, slide: 0 })
    expect(isEnd(end, outline)).toBe(true)
    expect(nextPos(end, outline)).toBe(end)
  })

  it('waits on a chapter that is still loading', () => {
    expect(nextPos({ chapter: 0, slide: 0 }, [null, 1])).toBeNull()
  })

  it('steps back into the previous chapter, skipping empty ones, and stops at the start', () => {
    expect(prevPos({ chapter: 3, slide: 0 }, outline)).toEqual({ chapter: 1, slide: 0 })
    expect(prevPos({ chapter: 1, slide: 0 }, outline)).toEqual({ chapter: 0, slide: 2 })
    expect(prevPos({ chapter: 4, slide: 0 }, outline)).toEqual({ chapter: 3, slide: 1 })
    expect(prevPos({ chapter: 1, slide: 0 }, [null, 1])).toEqual({ chapter: 0, slide: 0 })
    const first = { chapter: 0, slide: 0 }
    expect(prevPos(first, outline)).toBe(first)
  })

  it('skips to the next chapter', () => {
    expect(nextChapterPos({ chapter: 0, slide: 1 }, outline)).toEqual({ chapter: 1, slide: 0 })
    expect(nextChapterPos({ chapter: 1, slide: 0 }, outline)).toEqual({ chapter: 3, slide: 0 })
  })

  it('advances only when the slide has run its time, and resets the slide clock', () => {
    const s = startState(0)
    expect(advanceIfDue(s, 999, 1000, outline)).toBe(s)
    const next = advanceIfDue(s, 1000, 1000, outline)
    expect(next.pos).toEqual({ chapter: 0, slide: 1 })
    expect(elapsedMs(next, 1000)).toBe(0)
    expect(advanceIfDue(setPlaying(s, false, 10), 5000, 1000, outline).pos).toEqual({ chapter: 0, slide: 0 })
    expect(moveTo(s, { chapter: 0, slide: 0 }, 50)).toBe(s)
  })
})

describe('timing', () => {
  it('types one code point per step after a short delay', () => {
    expect(captionChars(' Café ❤️ ')).toEqual(['C', 'a', 'f', 'é', ' ', '❤', '️'])
    expect(typedCount(5, TYPE_DELAY_MS - 1)).toBe(0)
    expect(typedCount(5, TYPE_DELAY_MS)).toBe(1)
    expect(typedCount(5, TYPE_DELAY_MS + 2 * CHAR_MS)).toBe(3)
    expect(typedCount(5, 60_000)).toBe(5)
    expect(typedCount(5, 0, true)).toBe(5)
    expect(typingEndMs(0)).toBe(0)
    expect(typedCount(5, typingEndMs(5))).toBe(5)
  })

  it('gives a long caption time to be read', () => {
    expect(momentMs(3)).toBe(MOMENT_MIN_MS)
    expect(momentMs(200)).toBe(typingEndMs(200) + READ_MS)
  })
})

describe('kenBurns', () => {
  it('is deterministic per seed and keeps the pan inside the zoom margin', () => {
    expect(kenBurns('m1')).toEqual(kenBurns('m1'))
    expect(kenBurns('m1')).not.toEqual(kenBurns('m2'))
    for (const id of ['a', 'b', 'c', '01KMOMENT1', 'xyz']) {
      const k = kenBurns(id)
      for (const [s, x, y] of [[k.s0, k.x0, k.y0], [k.s1, k.x1, k.y1]] as const) {
        expect(s).toBeGreaterThanOrEqual(1.03)
        expect(s).toBeLessThanOrEqual(1.18)
        expect(Math.abs(x)).toBeLessThanOrEqual(((s - 1) / 2) * 100)
        expect(Math.abs(y)).toBeLessThanOrEqual(((s - 1) / 2) * 100)
      }
    }
  })
})

describe('slideAt', () => {
  const chapters = buildChapters([open('a', 1), locked('b', 2)])

  it('maps positions to title, moment, locked and final slides', () => {
    const world = detail(2)
    const content = { kind: 'open', world } as const
    expect(slideAt(chapters, 0, 0, { kind: 'pending' })).toMatchObject({ kind: 'title', number: 1, title: 'a' })
    expect(slideAt(chapters, 0, 0, content)).toMatchObject({ kind: 'title', title: 'A' })
    expect(slideAt(chapters, 0, 2, content)).toMatchObject({ kind: 'moment', index: 1, moment: { id: 'm1' } })
    expect(slideAt(chapters, 1, 0, { kind: 'locked', unlockAt: '2027-01-01T00:00:00Z' })).toMatchObject({ kind: 'locked', number: 2 })
    expect(slideAt(chapters, 0, 0, { kind: 'locked', unlockAt: 'later' })).toMatchObject({ kind: 'locked', unlockAt: 'later' })
    expect(slideAt(chapters, 2, 0, { kind: 'missing' })).toEqual({ kind: 'final' })
  })

  it('times each kind of slide', () => {
    expect(slideDuration(slideAt(chapters, 0, 0, { kind: 'pending' }))).toBe(TITLE_MS)
    expect(slideDuration(slideAt(chapters, 1, 0, { kind: 'locked', unlockAt: 'u' }))).toBe(LOCKED_MS)
    expect(slideDuration(slideAt(chapters, 0, 1, { kind: 'open', world: detail(1) }))).toBe(MOMENT_MIN_MS)
    expect(slideDuration({ kind: 'final' })).toBe(Infinity)
  })
})

describe('format', () => {
  it('formats a day and rejects anything that is not a real date', () => {
    expect(formatDay('2019-03-02', 'en-GB')).toBe('2 March 2019')
    expect(formatDay('2019-02-30', 'en-GB')).toBeNull()
    expect(formatDay('yesterday')).toBeNull()
    expect(formatDay(null)).toBeNull()
  })

  it('formats a countdown, dropping days when there are none', () => {
    expect(formatRemaining({ days: 3, hours: 4, minutes: 5, seconds: 6, done: false })).toBe('3d 04h 05m 06s')
    expect(formatRemaining({ days: 0, hours: 0, minutes: 0, seconds: 9, done: false })).toBe('00h 00m 09s')
  })
})
