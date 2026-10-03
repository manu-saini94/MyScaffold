// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseProgress, PROGRESS_KEY, readProgress, readProgressRaw, recordProgress } from './progress'

const stored = () => JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? 'null') as unknown

beforeEach(() => localStorage.clear())
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('parseProgress', () => {
  it('reads slugs and clamps to 0..1', () => {
    expect(parseProgress('{"a":0.5,"b":2,"c":-1}')).toEqual({ a: 0.5, b: 1, c: 0 })
  })

  it('drops non-numbers and non-finite values', () => {
    expect(parseProgress('{"a":"0.5","b":null,"c":0.25,"d":{}}')).toEqual({ c: 0.25 })
  })

  it.each([null, undefined, '', 'not json', '[0.5]', '42', 'null', '"x"'])('returns empty for %j', (raw) => {
    expect(parseProgress(raw)).toEqual({})
  })
})

describe('readProgressRaw', () => {
  it('reads the contract key', () => {
    const getItem = vi.fn(() => '{"a":1}')
    vi.stubGlobal('localStorage', { getItem })
    expect(readProgressRaw()).toBe('{"a":1}')
    expect(getItem).toHaveBeenCalledWith(PROGRESS_KEY)
    expect(PROGRESS_KEY).toBe('our-story-progress')
  })

  it('survives blocked storage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError')
      },
    })
    expect(readProgressRaw()).toBeNull()
  })
})

describe('recordProgress / readProgress', () => {
  it('writes { [slug]: value } under the contract key', () => {
    expect(recordProgress('our-firsts', 0.4)).toBe(true)
    expect(stored()).toEqual({ 'our-firsts': 0.4 })
  })

  it('only ever raises a value, clamps to 0..1 and keeps other worlds', () => {
    recordProgress('a', 0.6)
    recordProgress('b', 0.2)
    recordProgress('a', 0.3)
    recordProgress('b', 7)
    expect(stored()).toEqual({ a: 0.6, b: 1 })
    expect(recordProgress('a', Number.NaN)).toBe(false)
  })

  it('reads garbage as empty and drops non-numeric entries', () => {
    localStorage.setItem(PROGRESS_KEY, '{not json')
    expect(readProgress()).toEqual({})
    localStorage.setItem(PROGRESS_KEY, '[1,2]')
    expect(readProgress()).toEqual({})
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ a: 'x', b: 0.5, c: -2 }))
    expect(readProgress()).toEqual({ b: 0.5, c: 0 })
  })

  it('survives storage that throws on write and on read', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    expect(recordProgress('a', 0.5)).toBe(false)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(readProgress()).toEqual({})
    expect(recordProgress('a', 0.5)).toBe(false)
  })
})
