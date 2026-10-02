import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseProgress, PROGRESS_KEY, readProgressRaw } from './progress'

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
  afterEach(() => vi.unstubAllGlobals())

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
