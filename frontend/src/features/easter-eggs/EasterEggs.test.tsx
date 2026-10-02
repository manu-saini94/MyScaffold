// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LazyMotion, domMax } from 'motion/react'
import { EasterEggs } from './index'
import { RAIN_TOTAL_MS } from './HeartRain'
import { LOVE_NOTE } from './LoveNote'
import { MIDNIGHT_KEY } from './midnight'
import { KONAMI } from './sequences'

function stubReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

const mount = (props: Partial<Parameters<typeof EasterEggs>[0]> = {}) =>
  render(
    <LazyMotion features={domMax}>
      <EasterEggs nicknames={['Anvi', 'bubba']} {...props} />
      <h1 data-easter="title">Anvi ❤ Manu</h1>
      <input aria-label="name" />
      <div contentEditable suppressContentEditableWarning aria-label="editor" />
    </LazyMotion>,
  )

const type = (target: Element, keys: readonly string[]) => keys.forEach((key) => fireEvent.keyDown(target, { key }))
const rain = () => document.querySelector('[data-easter-rain]')

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.midnight
  stubReducedMotion(false)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null) // jsdom has no 2D canvas
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('nickname -> heart rain', () => {
  it('rains hearts when a nickname is typed anywhere, case-insensitively, then stops', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    mount()
    type(document.body, [...'xANVI'])
    expect(rain()?.getAttribute('data-easter-rain')).toBe('rain')
    expect(rain()?.getAttribute('aria-hidden')).toBe('true')
    act(() => vi.advanceTimersByTime(RAIN_TOTAL_MS))
    expect(rain()).toBeNull()
  })

  it('ignores typing in inputs and contenteditable', () => {
    mount()
    type(screen.getByLabelText('name'), [...'anvi'])
    type(screen.getByLabelText('editor'), [...'bubba'])
    expect(rain()).toBeNull()
  })

  it('ignores shortcuts with modifier keys', () => {
    mount()
    ;[...'anvi'].forEach((key) => fireEvent.keyDown(document.body, { key, ctrlKey: true }))
    expect(rain()).toBeNull()
  })

  it('plays a soft pulse instead under reduced motion', () => {
    stubReducedMotion(true)
    mount()
    type(document.body, [...'bubba'])
    expect(rain()?.getAttribute('data-easter-rain')).toBe('pulse')
  })
})

describe('Konami -> midnight', () => {
  it('toggles data-midnight on <html> and persists it', () => {
    mount()
    type(document.body, KONAMI)
    expect(document.documentElement.dataset.midnight).toBe('true')
    expect(localStorage.getItem(MIDNIGHT_KEY)).toBe('true')
    type(document.body, KONAMI)
    expect(document.documentElement.dataset.midnight).toBeUndefined()
    expect(localStorage.getItem(MIDNIGHT_KEY)).toBeNull()
  })

  it('restores a stored midnight on mount', () => {
    localStorage.setItem(MIDNIGHT_KEY, 'true')
    mount()
    expect(document.documentElement.dataset.midnight).toBe('true')
  })

  it('still toggles when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    mount()
    type(document.body, KONAMI)
    expect(document.documentElement.dataset.midnight).toBe('true')
  })

  it('is ignored while typing in a field', () => {
    mount()
    type(screen.getByLabelText('name'), KONAMI)
    expect(document.documentElement.dataset.midnight).toBeUndefined()
  })
})

describe('five title taps -> love note', () => {
  it('opens the note on the fifth quick tap; Escape closes it and focus returns', async () => {
    let t = 0
    mount({ now: () => (t += 400) })
    const title = screen.getByText('Anvi ❤ Manu')
    for (let i = 0; i < 4; i++) fireEvent.click(title)
    expect(screen.queryByRole('dialog')).toBeNull()
    title.setAttribute('tabindex', '-1')
    title.focus()
    fireEvent.click(title)

    const note = screen.getByRole('dialog', { name: LOVE_NOTE })
    expect(note.getAttribute('aria-modal')).toBe('true')
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep it close' })))
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(title)
  })

  it('does not open when the taps are too slow, or land elsewhere', () => {
    let t = 0
    mount({ now: () => (t += 1000) })
    const title = screen.getByText('Anvi ❤ Manu')
    for (let i = 0; i < 6; i++) fireEvent.click(title)
    for (let i = 0; i < 6; i++) fireEvent.click(document.body)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
