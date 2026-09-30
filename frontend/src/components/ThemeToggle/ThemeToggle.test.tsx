// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import themeReducer from '../../features/theme/themeSlice'
import { ThemeToggle } from './ThemeToggle'

function stubMotionPreference(reduced: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduced,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

function renderToggle() {
  const store = configureStore({ reducer: { theme: themeReducer } })
  render(
    <Provider store={store}>
      <ThemeToggle />
    </Provider>,
  )
  return store
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.dataset.theme = 'rose'
  document.head.innerHTML = '<meta name="theme-color" content="#fdfaf6">'
  document.documentElement.className = ''
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  Reflect.deleteProperty(document, 'startViewTransition')
})

describe('ThemeToggle', () => {
  it('advertises the theme it will switch to', () => {
    stubMotionPreference(true)
    renderToggle()
    expect(screen.getByRole('button', { name: 'Switch to Cinema (dark) theme' })).toBeTruthy()
  })

  it('switches theme, persists it, and updates <html>, the store and the label (reduced motion)', () => {
    stubMotionPreference(true)
    const store = renderToggle()
    fireEvent.click(screen.getByRole('button'))

    expect(document.documentElement.dataset.theme).toBe('cinema')
    expect(localStorage.getItem('our-story-theme')).toBe('cinema')
    expect(store.getState().theme.current).toBe('cinema')
    expect(screen.getByRole('button', { name: 'Switch to Rose (light) theme' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button'))
    expect(document.documentElement.dataset.theme).toBe('rose')
    expect(localStorage.getItem('our-story-theme')).toBe('rose')
  })

  it('without View Transitions it crossfades via a temporary class, then removes it', () => {
    stubMotionPreference(false)
    vi.useFakeTimers()
    renderToggle()
    fireEvent.click(screen.getByRole('button'))
    expect(document.documentElement.classList.contains('theme-fading')).toBe(true)
    expect(document.documentElement.dataset.theme).toBe('cinema')
    vi.advanceTimersByTime(500)
    expect(document.documentElement.classList.contains('theme-fading')).toBe(false)
  })

  it('with View Transitions it commits inside the transition and animates a circular reveal', async () => {
    stubMotionPreference(false)
    const animate = vi.fn()
    document.documentElement.animate = animate as unknown as typeof document.documentElement.animate
    const start = vi.fn((update: () => void) => {
      update()
      return { ready: Promise.resolve() }
    })
    Object.defineProperty(document, 'startViewTransition', { value: start, configurable: true })

    renderToggle()
    fireEvent.click(screen.getByRole('button'))
    await Promise.resolve()
    await Promise.resolve()

    expect(start).toHaveBeenCalledTimes(1)
    expect(document.documentElement.dataset.theme).toBe('cinema')
    expect(animate).toHaveBeenCalledTimes(1)
    const [keyframes, options] = animate.mock.calls[0]!
    expect(keyframes.clipPath[0]).toMatch(/^circle\(0px at /)
    expect(options.pseudoElement).toBe('::view-transition-new(root)')
  })
})
