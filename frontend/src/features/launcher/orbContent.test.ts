import { describe, expect, it } from 'vitest'
import type { World } from '../../types/world'
import { compactCountdown, orbPhoto, splitTitle } from './orbContent'
import { WORLDS_MOCK } from './worldsMock'

const base = WORLDS_MOCK[0]!
const LQIP = 'data:image/jpeg;base64,AAAA'
const cover = { mediaId: 'C1', width: 400, height: 300, lqip: LQIP, dominantColor: '#a1b2c3' }

describe('orbPhoto', () => {
  it('prefers the cover, with its LQIP and colour', () => {
    const w: World = { ...base, cover, previewMediaIds: ['P1'] }
    expect(orbPhoto(w)).toEqual({ mediaId: 'C1', lqip: LQIP, color: '#a1b2c3' })
  })

  it('falls back to the first preview (no LQIP for previews)', () => {
    expect(orbPhoto({ ...base, previewMediaIds: ['P1', 'P2'] })).toEqual({ mediaId: 'P1', lqip: null, color: null })
  })

  it('returns null with no photo, and for a locked world even if media slipped through', () => {
    expect(orbPhoto(base)).toBeNull()
    expect(orbPhoto({ ...base, locked: true, cover, previewMediaIds: ['P1'] })).toBeNull()
  })

  it('drops an unsafe LQIP or colour', () => {
    const w: World = { ...base, cover: { ...cover, lqip: 'javascript:alert(1)', dominantColor: 'red;}' } }
    expect(orbPhoto(w)).toEqual({ mediaId: 'C1', lqip: null, color: null })
  })
})

describe('splitTitle', () => {
  it.each([
    ['Anvi ❤ Manu', 'Anvi', 'Manu'],
    ['Anvi ❤️ Manu', 'Anvi', 'Manu'],
    ['Anvi♥Manu', 'Anvi', 'Manu'],
    ['Anvi & Manu', 'Anvi', 'Manu'],
  ])('splits %j', (title, left, right) => {
    expect(splitTitle(title)).toEqual({ left, right })
  })

  it('returns null without a heart or with an empty side', () => {
    expect(splitTitle('Our Story')).toBeNull()
    expect(splitTitle('❤ Manu')).toBeNull()
  })
})

describe('compactCountdown', () => {
  it('shows days while more than a day remains, seconds on the last day', () => {
    expect(compactCountdown({ days: 112, hours: 4, minutes: 9, seconds: 27 })).toBe('112d 04:09')
    expect(compactCountdown({ days: 0, hours: 4, minutes: 9, seconds: 7 })).toBe('04:09:07')
  })
})
