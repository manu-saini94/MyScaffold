import { describe, expect, it } from 'vitest'
import { monogram, splitProfiles } from './profiles'

describe('monogram', () => {
  it('takes the first visible character, upper-cased', () => {
    expect(monogram('  anvi ')).toBe('A')
    expect(monogram('Émile')).toBe('É')
    expect(monogram('')).toBe('?')
  })
})

describe('splitProfiles', () => {
  it('finds viewer and decoy regardless of order', () => {
    const me = { id: '2', name: 'Me', role: 'decoy' as const }
    const her = { id: '1', name: 'Her', role: 'viewer' as const }
    expect(splitProfiles([me, her])).toEqual({ viewer: her, decoy: me })
    expect(splitProfiles([])).toEqual({ viewer: undefined, decoy: undefined })
  })
})
