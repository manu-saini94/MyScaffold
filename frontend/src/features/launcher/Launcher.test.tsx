// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LazyMotion, domMax } from 'motion/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { Launcher } from './Launcher'
import { WORLDS_MOCK } from './worldsMock'

vi.mock('../world/preload', () => ({ preloadWorld: vi.fn(() => Promise.resolve()) }))
const list = vi.hoisted(() => ({ isError: false, retry: vi.fn() }))
vi.mock('./useWorlds', async (orig) => ({
  ...(await orig<typeof import('./useWorlds')>()),
  useWorldList: () => ({
    worlds: list.isError ? [] : WORLDS_MOCK,
    loading: false,
    isError: list.isError,
    refetch: list.retry,
  }),
}))

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>
}

function renderLauncher() {
  return render(
    <MemoryRouter>
      <LazyMotion features={domMax} strict>
        <Launcher active />
        <Where />
      </LazyMotion>
    </MemoryRouter>,
  )
}

const cellOf = (el: Element | null) => (el as HTMLElement | null)?.dataset.cell

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
  list.retry.mockClear()
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('Launcher', () => {
  it('shows all six chapters as buttons, with the locked one announced as locked', () => {
    renderLauncher()
    expect(screen.getAllByRole('button')).toHaveLength(6)
    expect(screen.getByRole('button', { name: 'Our Forever, locked' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Our Firsts' })).toBeTruthy()
  })

  it('has one tab stop (roving tabindex) that starts on the centre chapter', () => {
    renderLauncher()
    const stops = screen.getAllByRole('button').filter((b) => b.tabIndex === 0)
    expect(stops).toHaveLength(1)
    expect(cellOf(stops[0]!)).toBe('0')
  })

  it('arrow keys move focus between chapters; Home returns to the first', () => {
    renderLauncher()
    const first = screen.getByRole('button', { name: 'Where It All Began' })
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(cellOf(document.activeElement)).toBe('3')

    fireEvent.keyDown(document.activeElement!, { key: 'Home' })
    expect(cellOf(document.activeElement)).toBe('0')
  })

  it('arrow keys never land on a ghost cell', () => {
    renderLauncher()
    const first = screen.getByRole('button', { name: 'Where It All Began' })
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowLeft' }) // only a ghost lies to the left
    expect(cellOf(document.activeElement)).toBe('0')
  })

  it('ignores unrelated keys', () => {
    renderLauncher()
    const first = screen.getByRole('button', { name: 'Where It All Began' })
    first.focus()
    fireEvent.keyDown(first, { key: 'a' })
    expect(cellOf(document.activeElement)).toBe('0')
  })

  it('clicking an unlocked chapter navigates to its world', () => {
    renderLauncher()
    fireEvent.click(screen.getByRole('button', { name: 'Our Firsts' }))
    expect(screen.getByTestId('where').textContent).toBe('/world/our-firsts')
  })

  it('clicking the locked chapter glides it to the centre and shows its countdown, without navigating', async () => {
    renderLauncher()
    fireEvent.click(screen.getByRole('button', { name: 'Our Forever, locked' }))
    expect(await screen.findByRole('timer', {}, { timeout: 4000 })).toBeTruthy()
    expect(screen.getByTestId('where').textContent).toBe('/')
  })

  it('shows a retry state when the experience failed to load, and retries on click', () => {
    list.isError = true
    renderLauncher()
    expect(screen.getByRole('alert').textContent).toMatch(/did not load/)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(list.retry).toHaveBeenCalledTimes(1)
  })
})
