import { describe, expect, it } from 'vitest'
import { mediaSrcSet, mediaUrl, safeHex, safeLqip } from './media'

describe('mediaUrl', () => {
  it('builds the contract path for every size', () => {
    expect(mediaUrl('01KABC', 'thumb')).toBe('/api/media/01KABC/thumb')
    expect(mediaUrl('01KABC', 'medium')).toBe('/api/media/01KABC/medium')
    expect(mediaUrl('01KABC', 'full')).toBe('/api/media/01KABC/full')
  })

  it('encodes the id so it can never leave the media path', () => {
    expect(mediaUrl('../x?y', 'thumb')).toBe('/api/media/..%2Fx%3Fy/thumb')
  })
})

describe('mediaSrcSet', () => {
  it('lists the three backend widths', () => {
    expect(mediaSrcSet('A')).toBe('/api/media/A/thumb 480w, /api/media/A/medium 1280w, /api/media/A/full 2560w')
  })
})

describe('safeLqip / safeHex', () => {
  it('accepts a base64 image data URI and rejects anything that could break out of url()', () => {
    expect(safeLqip('data:image/jpeg;base64,/9j/4AAQ==')).toBe('data:image/jpeg;base64,/9j/4AAQ==')
    expect(safeLqip('data:image/jpeg;base64,AA") ; background:url(evil')).toBeNull()
    expect(safeLqip('https://example.com/x.jpg')).toBeNull()
    expect(safeLqip(null)).toBeNull()
  })

  it('accepts #rrggbb only', () => {
    expect(safeHex('#d6304f')).toBe('#d6304f')
    expect(safeHex('red')).toBeNull()
    expect(safeHex('#fff')).toBeNull()
    expect(safeHex(undefined)).toBeNull()
  })
})
