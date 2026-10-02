import { describe, expect, it } from 'vitest'
import { isKonami, KONAMI, matchNickname, normalizeNicknames, pushKonami, pushTyped, registerTap } from './sequences'

const typeAll = (keys: string[], max: number) => keys.reduce((b, k) => pushTyped(b, k, max), '')

describe('nickname buffer', () => {
  const names = normalizeNicknames(['  Anvi ', 'BUBBA', '', 'anvi'])

  it('normalises nicknames', () => {
    expect(names).toEqual(['anvi', 'bubba'])
  })

  it('matches case-insensitively at the end of the buffer', () => {
    expect(matchNickname(typeAll(['x', 'A', 'n', 'V', 'i'], 5), names)).toBe('anvi')
    expect(matchNickname(typeAll([...'bubba'], 5), names)).toBe('bubba')
  })

  it('ignores non-character keys and keeps only the last max characters', () => {
    expect(typeAll(['a', 'Shift', 'n', 'ArrowUp', 'v', 'i'], 4)).toBe('anvi')
    expect(typeAll([...'abcdef'], 3)).toBe('def')
  })

  it('does not match partial or interrupted names', () => {
    expect(matchNickname(typeAll([...'anv'], 5), names)).toBeNull()
    expect(matchNickname(typeAll([...'anxvi'], 5), names)).toBeNull()
  })
})

describe('Konami matcher', () => {
  const run = (keys: readonly string[]) => keys.reduce<string[]>((h, k) => pushKonami(h, k), [])

  it('matches the exact sequence, with or without Shift on the letters', () => {
    expect(isKonami(run(KONAMI))).toBe(true)
    expect(isKonami(run([...KONAMI.slice(0, 8), 'B', 'A']))).toBe(true)
  })

  it('matches after noise and after an extra leading ArrowUp', () => {
    expect(isKonami(run(['x', 'ArrowUp', ...KONAMI]))).toBe(true)
  })

  it('rejects a wrong or incomplete sequence', () => {
    expect(isKonami(run(KONAMI.slice(0, 9)))).toBe(false)
    expect(isKonami(run([...KONAMI.slice(0, 9), 'c']))).toBe(false)
  })
})

describe('tap-burst counter (injected clock)', () => {
  const tapAt = (times: number[]) => {
    let taps: number[] = []
    const fired: number[] = []
    for (const t of times) {
      const r = registerTap(taps, t)
      taps = r.taps
      if (r.fired) fired.push(t)
    }
    return fired
  }

  it('fires on the fifth tap within 3s', () => {
    expect(tapAt([0, 500, 1000, 1500, 2999])).toEqual([2999])
  })

  it('does not fire when the taps are spread over more than 3s', () => {
    expect(tapAt([0, 800, 1600, 2400, 3200])).toEqual([])
  })

  it('starts over after firing', () => {
    expect(tapAt([0, 1, 2, 3, 4, 5, 6, 7, 8])).toEqual([4])
  })
})
