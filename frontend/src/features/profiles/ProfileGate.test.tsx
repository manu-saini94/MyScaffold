// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LazyMotion, domMax } from 'motion/react'
import { chooseProfile } from '../session/sessionSlice'
import { setTheme } from '../theme/themeSlice'
import { ENTER_MS, ProfileGate } from './ProfileGate'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  dispatch: vi.fn(),
  refetch: vi.fn(),
  experience: {} as Record<string, unknown>,
}))

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mocks.navigate,
}))

vi.mock('../../app/hooks', () => ({ useAppDispatch: () => mocks.dispatch }))

vi.mock('../../services/experienceApi', () => ({ useGetExperienceQuery: () => mocks.experience }))

const PROFILES = [
  { id: 'p-her', name: 'Anvi', role: 'viewer' },
  { id: 'p-me', name: 'Manu', role: 'decoy' },
]

function renderGate() {
  return render(
    <LazyMotion features={domMax} strict>
      <ProfileGate />
    </LazyMotion>,
  )
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  mocks.experience = {
    data: { appTitle: 'Our Story', tagline: null, profiles: PROFILES },
    isLoading: false,
    isError: false,
    refetch: mocks.refetch,
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('ProfileGate', () => {
  it("asks who's here, with one distinct avatar button per profile", () => {
    renderGate()
    expect(screen.getByRole('heading', { level: 1, name: "Who's here?" })).toBeTruthy()
    expect(screen.getByText('Our Story')).toBeTruthy()
    const her = screen.getByRole('button', { name: 'Anvi' })
    const me = screen.getByRole('button', { name: 'Manu' })
    expect(her.querySelector('[data-role="viewer"]')?.textContent).toBe('A')
    expect(me.querySelector('[data-role="decoy"]')?.textContent).toBe('M')
  })

  it('focuses the heading on mount and applies the server default theme', () => {
    localStorage.clear()
    mocks.experience = { ...mocks.experience, data: { appTitle: 'Our Story', defaultTheme: 'cinema', profiles: PROFILES } }
    renderGate()
    const heading = screen.getByRole('heading', { level: 1 })
    expect(document.activeElement).toBe(heading)
    expect(heading.getAttribute('tabindex')).toBe('-1')
    expect(mocks.dispatch).toHaveBeenCalledWith(setTheme('cinema'))
  })

  it('a second decoy tap re-announces the note (fresh live-region node)', async () => {
    renderGate()
    const me = screen.getByRole('button', { name: 'Manu' })
    fireEvent.click(me)
    const first = screen.getByText(/Nope, this one's for Anvi/)
    fireEvent.click(me)
    await waitFor(() => {
      const next = screen.getByText(/Nope, this one's for Anvi/)
      expect(next).not.toBe(first)
      expect(first.isConnected).toBe(false)
    })
  })

  it('choosing her dispatches chooseProfile("her") and navigates home after the scale-up', async () => {
    renderGate()
    fireEvent.click(screen.getByRole('button', { name: 'Anvi' }))
    expect(mocks.navigate).not.toHaveBeenCalled()
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/'), { timeout: ENTER_MS + 1000 })
    expect(mocks.dispatch).toHaveBeenCalledWith(chooseProfile('her'))
  })

  it('choosing the decoy shows the cheeky note and never proceeds', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    renderGate()
    const me = screen.getByRole('button', { name: 'Manu' })
    fireEvent.click(me)

    expect(screen.getByRole('status').textContent).toContain("Nope, this one's for Anvi 💌")
    expect(screen.getByRole('status').textContent).toContain('Nice try, Manu.')
    expect(me.getAttribute('aria-describedby')).toBeTruthy()

    act(() => vi.advanceTimersByTime(5000))
    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(mocks.dispatch).not.toHaveBeenCalled()
    expect(me.getAttribute('aria-describedby')).toBeNull() // back to the choice
  })

  it('profiles are native, focusable buttons, so Enter/Space activate them', async () => {
    renderGate()
    const her = screen.getByRole('button', { name: 'Anvi' }) as HTMLButtonElement
    expect(her.tagName).toBe('BUTTON')
    expect(her.type).toBe('button')
    expect(her.tabIndex).toBe(0)
    her.focus()
    expect(document.activeElement).toBe(her)
    // Browsers turn Enter/Space on a focused <button> into a click with detail 0; jsdom does not, so dispatch it directly.
    fireEvent.click(document.activeElement as HTMLElement, { detail: 0 })
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/'), { timeout: ENTER_MS + 1000 })
  })

  it('loading shows placeholders; error offers a retry', () => {
    mocks.experience = { isLoading: true, isError: false, refetch: mocks.refetch }
    const { unmount } = renderGate()
    expect(screen.getByText('Loading profiles')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    unmount()

    mocks.experience = { isLoading: false, isError: true, refetch: mocks.refetch }
    renderGate()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(mocks.refetch).toHaveBeenCalledTimes(1)
  })
})
