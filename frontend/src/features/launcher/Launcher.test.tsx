// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LazyMotion, domMax } from 'motion/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { World } from '../../types/world'
import { Launcher } from './Launcher'
import { PROGRESS_KEY } from './progress'
import { WORLDS_MOCK } from './worldsMock'

vi.mock('../world/preload', () => ({ preloadWorld: vi.fn(() => Promise.resolve()) }))
const list = vi.hoisted(() => ({
  isError: false,
  retry: vi.fn(),
  worlds: null as readonly World[] | null,
  appTitle: 'Anvi ❤ Manu' as string | null,
}))
vi.mock('./useWorlds', async (orig) => ({
  ...(await orig<typeof import('./useWorlds')>()),
  useWorldList: () => ({
    worlds: list.isError ? [] : (list.worlds ?? WORLDS_MOCK),
    loading: false,
    isError: list.isError,
    refetch: list.retry,
    appTitle: list.appTitle,
    tagline: 'Love you till eternity and back',
  }),
}))

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>
}

function renderLauncher(active = true) {
  const ui = (a: boolean) => (
    <MemoryRouter>
      <LazyMotion features={domMax} strict>
        <Launcher active={a} />
        <Where />
      </LazyMotion>
    </MemoryRouter>
  )
  const r = render(ui(active))
  return { ...r, setActive: (a: boolean) => r.rerender(ui(a)) }
}

const orbIndex = (el: Element | null) => (el as HTMLElement | null)?.dataset.orb

beforeEach(() => {
  // Freeze Date before the fixture's unlock instant so the locked-world tests never expire.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-01T00:00:00Z'))
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

afterEach(() => {
  list.isError = false
  list.worlds = null
  list.appTitle = 'Anvi ❤ Manu'
  list.retry.mockClear()
  localStorage.clear()
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('Launcher hero', () => {
  it('shows the app title with the heart drawn, named for screen readers, and the tagline', () => {
    renderLauncher()
    const h1 = screen.getByRole('heading', { level: 1, name: 'Anvi and Manu' })
    expect(h1.closest('[data-click-effect="sparkle"]')).toBeTruthy()
    expect(screen.getByText('Love you till eternity and back')).toBeTruthy()
  })

  it('falls back to the default title while the payload is loading', () => {
    list.appTitle = null
    renderLauncher()
    expect(screen.getByRole('heading', { level: 1, name: 'Anvi and Manu' })).toBeTruthy()
  })
})

describe('Launcher orbs', () => {
  it('shows all six chapters as buttons, with the locked one announced as locked', () => {
    renderLauncher()
    const group = screen.getByRole('group', { name: /Chapters of our story/ })
    expect(group.querySelectorAll('button')).toHaveLength(6)
    expect(screen.getByRole('button', { name: 'Our Forever, locked' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Our Firsts' })).toBeTruthy()
  })

  it('every chapter is a tab stop and is described by its subtitle', () => {
    renderLauncher()
    const orb = screen.getByRole('button', { name: 'Our Firsts' })
    expect(orb.tabIndex).toBe(0)
    expect(document.getElementById(orb.getAttribute('aria-describedby')!)?.textContent).toContain(
      'First trips, first laughs, first of many.',
    )
  })

  it('clicking an unlocked chapter navigates to its world', () => {
    renderLauncher()
    fireEvent.click(screen.getByRole('button', { name: 'Our Firsts' }))
    expect(screen.getByTestId('where').textContent).toBe('/world/our-firsts')
  })

  it('the locked chapter shows a live countdown on its face and does not navigate', () => {
    renderLauncher()
    const locked = screen.getByRole('button', { name: 'Our Forever, locked' })
    const timer = locked.querySelector('[role="timer"]')!
    expect(timer.textContent).toMatch(/^\d+d \d{2}:\d{2}$/)
    expect(timer.getAttribute('aria-label')).toMatch(/^Opens in \d+ days, \d+ hours$/)
    fireEvent.click(locked)
    expect(screen.getByTestId('where').textContent).toBe('/')
    expect(locked.closest('[data-peek]')).toBeTruthy() // tap reveals the "Opens on" card
    expect(document.getElementById(locked.getAttribute('aria-describedby')!)?.textContent).toMatch(/Opens on 1[34] February 2027/ /* local-time date */)
  })

  it('shows the cover photo via the media thumb URL, else the first preview, else no image', () => {
    list.worlds = [
      { ...WORLDS_MOCK[0]!, cover: { mediaId: 'COVER1', width: 4, height: 3, lqip: null, dominantColor: null } },
      { ...WORLDS_MOCK[1]!, previewMediaIds: ['PREV1', 'PREV2'] },
      WORLDS_MOCK[2]!,
    ]
    renderLauncher()
    const img = (name: string) => screen.getByRole('button', { name }).querySelector('img')
    expect(img('Where It All Began')?.getAttribute('src')).toBe('/api/media/COVER1/thumb')
    expect(img('Our Firsts')?.getAttribute('src')).toBe('/api/media/PREV1/thumb')
    expect(img('Adventures Together')).toBeNull()
    expect(Number(img('Our Firsts')?.getAttribute('width'))).toBeGreaterThan(0)
  })

  it('draws a progress ring only for worlds with stored progress', () => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ 'our-firsts': 0.4, 'the-question': 0 }))
    renderLauncher()
    const ring = (name: string) => screen.getByRole('button', { name }).querySelector('svg circle[stroke-dasharray]')
    expect(ring('Our Firsts')?.getAttribute('stroke-dasharray')).toBe('0.4 1')
    expect(ring('The Question')).toBeNull()
    expect(ring('Where It All Began')).toBeNull()
  })

  it('arrow keys move focus to an orb in that direction; Home and End jump to the ends', () => {
    renderLauncher()
    const first = screen.getByRole('button', { name: 'Where It All Began' })
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(orbIndex(document.activeElement)).not.toBe('0')
    fireEvent.keyDown(document.activeElement!, { key: 'End' })
    expect(orbIndex(document.activeElement)).toBe('5')
    fireEvent.keyDown(document.activeElement!, { key: 'Home' })
    expect(orbIndex(document.activeElement)).toBe('0')
  })

  it('ignores unrelated keys and stays put at an edge', () => {
    renderLauncher()
    const first = screen.getByRole('button', { name: 'Where It All Began' })
    first.focus()
    fireEvent.keyDown(first, { key: 'a' })
    fireEvent.keyDown(first, { key: 'ArrowUp' }) // the first chapter sits in the top row
    expect(orbIndex(document.activeElement)).toBe('0')
  })

  it('goes inert while a world is open and gives focus back to the opener afterwards', () => {
    const { setActive } = renderLauncher()
    const orb = screen.getByRole('button', { name: 'Our Firsts' })
    orb.focus()
    setActive(false)
    expect(orb.closest('[inert]')).toBeTruthy()
    act(() => orb.blur())
    setActive(true)
    expect(document.activeElement).toBe(orb)
  })

  it('shows a retry state when the experience failed to load, and retries on click', () => {
    list.isError = true
    renderLauncher()
    expect(screen.getByRole('alert').textContent).toMatch(/did not load/)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(list.retry).toHaveBeenCalledTimes(1)
  })
})
