// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LazyMotion, domMax } from 'motion/react'
import { HINTS } from './hints'
import { UnlockScreen } from './UnlockScreen'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  unlock: vi.fn(),
  checkStatus: vi.fn(),
  refetch: vi.fn(),
  question: {} as Record<string, unknown>,
}))

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mocks.navigate,
}))

vi.mock('../../services/authApi', () => ({
  authApi: { useLazyGetAuthStatusQuery: () => [mocks.checkStatus] },
  useGetQuestionQuery: () => mocks.question,
  useUnlockMutation: () => [mocks.unlock, { isLoading: false }],
}))

const QUESTION = 'What is the sample question?'

function problem(code: string, status: number, extra: object = {}) {
  return { status, data: { type: `urn:ourstory:problem:${code}`, title: code, status, ...extra } }
}

function unlockResolves(unlocked = true) {
  mocks.unlock.mockReturnValue({ unwrap: () => Promise.resolve(undefined) })
  mocks.checkStatus.mockReturnValue({ unwrap: () => Promise.resolve({ unlocked }) })
}

function unlockRejects(error: unknown) {
  mocks.unlock.mockReturnValue({ unwrap: () => Promise.reject(error) })
}

function stubReducedMotion(reduced: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduced,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

function renderScreen() {
  return render(
    <LazyMotion features={domMax} strict>
      <UnlockScreen />
    </LazyMotion>,
  )
}

async function answer(value = 'Sample') {
  fireEvent.change(screen.getByLabelText('Your answer'), { target: { value } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
  })
}

beforeEach(() => {
  stubReducedMotion(false)
  mocks.question = { data: { question: QUESTION }, isLoading: false, isError: false, refetch: mocks.refetch }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('UnlockScreen', () => {
  it('asks the question with a quiet, non-autocorrecting answer field', () => {
    renderScreen()
    expect(screen.getByRole('heading', { level: 1, name: QUESTION })).toBeTruthy()
    const input = screen.getByLabelText('Your answer')
    expect(input.getAttribute('autocomplete')).toBe('off')
    expect(input.getAttribute('autocapitalize')).toBe('off')
    expect(input.getAttribute('spellcheck')).toBe('false')
    expect(input.getAttribute('enterkeyhint')).toBe('go')
    expect((screen.getByRole('button', { name: 'Unlock' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('happy path: sends the answer, blooms, then navigates to /who', async () => {
    unlockResolves()
    renderScreen()
    await answer('Sample')
    expect(mocks.unlock).toHaveBeenCalledWith({ answer: 'Sample' })
    expect(mocks.checkStatus).toHaveBeenCalledWith(undefined, false) // fresh read, never the cache
    expect(screen.getByTestId('bloom')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toMatch(/Unlocked/)
    expect(mocks.navigate).not.toHaveBeenCalled()
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/who'), { timeout: 2000 })
  })

  it('with reduced motion it still blooms (as a fade) and navigates', async () => {
    stubReducedMotion(true)
    unlockResolves()
    renderScreen()
    await answer()
    expect(screen.getByTestId('bloom')).toBeTruthy()
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/who'), { timeout: 2000 })
  })

  it('204 but the cookie did not stick: no bloom, a kind cookies message, form stays usable', async () => {
    unlockResolves(false)
    renderScreen()
    await answer()
    expect(screen.queryByTestId('bloom')).toBeNull()
    expect(screen.getByRole('status').textContent).toMatch(/couldn't keep you signed in.*cookies are allowed/)
    expect((screen.getByLabelText('Your answer') as HTMLInputElement).disabled).toBe(false)
    await new Promise((r) => setTimeout(r, 1200))
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('status check failing after 204: safe message, no bloom', async () => {
    mocks.unlock.mockReturnValue({ unwrap: () => Promise.resolve(undefined) })
    mocks.checkStatus.mockReturnValue({ unwrap: () => Promise.reject({ status: 'FETCH_ERROR', error: 'x' }) })
    renderScreen()
    await answer()
    expect(screen.queryByTestId('bloom')).toBeNull()
    expect(screen.getByRole('status').textContent).toMatch(/Couldn't reach the server/)
  })

  it('a mutation that throws synchronously is still handled (no unhandled rejection)', async () => {
    mocks.unlock.mockImplementation(() => {
      throw new Error('boom')
    })
    renderScreen()
    await answer()
    expect(screen.getByRole('status').textContent).toMatch(/Something went sideways/)
  })

  it('caps the answer at 100 characters (contract)', () => {
    renderScreen()
    expect(screen.getByLabelText('Your answer').getAttribute('maxlength')).toBe('100')
  })

  it('401: rotates playful hints and warns softly when attempts run low', async () => {
    unlockRejects(problem('unlock-failed', 401, { attemptsRemaining: 3 }))
    renderScreen()
    await answer()
    const status = screen.getByRole('status')
    expect(status.textContent).toContain(HINTS[0])
    expect(status.textContent).not.toMatch(/more try|more tries/)
    expect(screen.getByLabelText('Your answer').getAttribute('aria-invalid')).toBe('true')

    unlockRejects(problem('unlock-failed', 401, { attemptsRemaining: 1 }))
    await answer()
    expect(status.textContent).toContain(HINTS[1])
    expect(status.textContent).toContain('One more try')
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('429: disables the input, counts down, and re-enables at zero', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    unlockRejects(problem('too-many-attempts', 429, { retryAfterSeconds: 3 }))
    renderScreen()
    await answer()

    const input = screen.getByLabelText('Your answer') as HTMLInputElement
    expect(input.disabled).toBe(true)
    expect(screen.getByRole('timer').textContent).toBe('0:03')

    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByRole('timer').textContent).toBe('0:02')

    act(() => vi.advanceTimersByTime(2000))
    expect(screen.queryByRole('timer')).toBeNull()
    expect(input.disabled).toBe(false)
    expect(screen.getByRole('status').textContent).toMatch(/Ready when you are/)
  })

  it('503 on unlock: shows the kind not-ready message and removes the input', async () => {
    unlockRejects(problem('unlock-not-configured', 503))
    renderScreen()
    await answer()
    const heading = screen.getByRole('heading', { name: 'Not quite ready yet' })
    expect(screen.queryByLabelText('Your answer')).toBeNull()
    expect(document.activeElement).toBe(heading)
    expect(heading.getAttribute('tabindex')).toBe('-1')
  })

  it('503 on the question: goes straight to not-ready', () => {
    mocks.question = { isLoading: false, isError: true, error: problem('unlock-not-configured', 503), refetch: mocks.refetch }
    renderScreen()
    expect(screen.getByRole('heading', { name: 'Not quite ready yet' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('400: shows the problem detail', async () => {
    unlockRejects(problem('validation-failed', 400, { detail: 'Answer is too long.' }))
    renderScreen()
    await answer()
    expect(screen.getByRole('status').textContent).toBe('Answer is too long.')
  })

  it('network error: shows a short safe message', async () => {
    unlockRejects({ status: 'FETCH_ERROR', error: 'TypeError: Failed to fetch' })
    renderScreen()
    await answer()
    expect(screen.getByRole('status').textContent).toMatch(/Couldn't reach the server/)
  })

  it('question loading: a placeholder and no input', () => {
    mocks.question = { isLoading: true, isError: false, refetch: mocks.refetch }
    renderScreen()
    expect(screen.getByText('Loading the question')).toBeTruthy()
    expect(screen.queryByLabelText('Your answer')).toBeNull()
  })

  it('question error: offers a retry that refetches', () => {
    mocks.question = { isLoading: false, isError: true, error: { status: 500, data: null }, refetch: mocks.refetch }
    renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(mocks.refetch).toHaveBeenCalledTimes(1)
  })
})
