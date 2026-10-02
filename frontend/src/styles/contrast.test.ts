/// <reference types="node" />
// Node fs, not `?raw`: Vitest stubs every stylesheet import to an empty string.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrastRatio, luminance, passesAA } from './contrast'

const themes = readFileSync(new URL('./_themes.scss', import.meta.url), 'utf8')

describe('contrast helpers', () => {
  it('matches the WCAG reference points', () => {
    expect(luminance('#000')).toBe(0)
    expect(luminance('#ffffff')).toBeCloseTo(1, 6)
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 6)
    expect(contrastRatio('#fff', '#fff')).toBe(1)
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2)
  })

  it('is symmetric and applies the large-text threshold', () => {
    expect(contrastRatio('#6b4e0e', '#ffffff')).toBe(contrastRatio('#ffffff', '#6b4e0e'))
    expect(passesAA('#777777', '#ffffff')).toBe(false)
    expect(passesAA('#777777', '#ffffff', true)).toBe(true)
  })

  it('rejects anything that is not a hex colour', () => {
    expect(() => luminance('red')).toThrow(/Not a hex colour/)
    expect(() => luminance('#12345')).toThrow()
  })
})

// Reads the real theme tokens (raw _themes.scss) so a palette edit that breaks readability fails here.
function token(theme: 'rose' | 'cinema', name: string): string {
  const block = themes.split(`@mixin theme-${theme}`)[1]!.split('@mixin')[0]!
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,6});`).exec(block)
  if (!m) throw new Error(`--${name} missing in ${theme}`)
  return m[1]!
}

describe.each(['rose', 'cinema'] as const)('%s theme text tokens', (theme) => {
  it.each(['text', 'text-muted'])('--%s passes AA on --bg and --surface', (name) => {
    const fg = token(theme, name)
    expect(passesAA(fg, token(theme, 'bg'))).toBe(true)
    expect(passesAA(fg, token(theme, 'surface'))).toBe(true)
  })

  it('has a pure white background on rose', () => {
    if (theme === 'rose') expect(token(theme, 'bg')).toBe('#ffffff')
  })
})
