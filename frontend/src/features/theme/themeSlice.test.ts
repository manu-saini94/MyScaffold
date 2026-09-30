// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import reducer, { applyTheme, readStoredTheme, selectTheme, setTheme } from './themeSlice'

function meta(): HTMLMetaElement {
  return document.head.querySelector('meta[name="theme-color"]') as HTMLMetaElement
}

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
  document.head.innerHTML = '<meta name="theme-color" content="#fdfaf6">'
  vi.restoreAllMocks()
})

describe('readStoredTheme (state set by the inline boot script)', () => {
  it('defaults to rose', () => {
    expect(readStoredTheme()).toBe('rose')
  })

  it('reads cinema from <html data-theme>', () => {
    document.documentElement.dataset.theme = 'cinema'
    expect(readStoredTheme()).toBe('cinema')
  })

  it('falls back to rose for junk values', () => {
    document.documentElement.dataset.theme = 'neon'
    expect(readStoredTheme()).toBe('rose')
  })
})

describe('applyTheme', () => {
  it('writes <html data-theme>, the browser chrome colour and localStorage', () => {
    applyTheme('cinema')
    expect(document.documentElement.dataset.theme).toBe('cinema')
    expect(meta().content).toBe('#141414')
    expect(localStorage.getItem('our-story-theme')).toBe('cinema')

    applyTheme('rose')
    expect(document.documentElement.dataset.theme).toBe('rose')
    expect(meta().content).toBe('#fdfaf6')
    expect(localStorage.getItem('our-story-theme')).toBe('rose')
  })

  it('still applies the theme when storage is blocked (private mode)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    expect(() => applyTheme('cinema')).not.toThrow()
    expect(document.documentElement.dataset.theme).toBe('cinema')
  })

  it('does not fail when there is no theme-color meta tag', () => {
    document.head.innerHTML = ''
    expect(() => applyTheme('cinema')).not.toThrow()
  })
})

describe('theme reducer', () => {
  it('starts from the theme the boot script chose and switches on setTheme', () => {
    const initial = reducer(undefined, { type: '@@init' })
    expect(initial.current).toBe('rose')
    const next = reducer(initial, setTheme('cinema'))
    expect(next.current).toBe('cinema')
    expect(initial.current).toBe('rose') // not mutated
    expect(selectTheme({ theme: next })).toBe('cinema')
  })
})
