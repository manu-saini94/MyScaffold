// @vitest-environment jsdom
// Separate file on purpose: faking setInterval stalls motion's frame loop for the rest of a file.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen } from '@testing-library/react'
import { resetServerClock } from '../../services/serverClock'
import { RELOCK_RETRY_MS } from './LockedTeaser'
import { T0, installDomStubs, json, lockedWorld, openWorld, renderWorldAt, stubFetch, worldQueryStatus } from './test-support'

beforeEach(() => {
  installDomStubs()
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  vi.setSystemTime(new Date(T0))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetServerClock()
})

describe('locked world', () => {
  it('shows the teaser with a countdown on the server clock, refetches at zero, then opens', async () => {
    // device clock 1h behind the server: the countdown must still read 3 seconds
    vi.setSystemTime(new Date(Date.parse(T0) - 3_600_000))
    const calls = stubFetch((_p, n) => (n === 1 ? json(lockedWorld()) : json(openWorld({ slug: 'our-forever', title: 'Our Forever' }))))
    renderWorldAt('/world/our-forever')

    const timer = await screen.findByRole('timer')
    expect(timer.getAttribute('aria-label')).toBe('Opens in 0 days, 0 hours, 0 minutes and 3 seconds')
    expect(screen.getByRole('heading', { name: 'Our Forever' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to all chapters' }).getAttribute('href')).toBe('/')

    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByRole('timer').getAttribute('aria-label')).toMatch(/1 seconds$/)
    expect(calls).toHaveLength(1)

    act(() => vi.advanceTimersByTime(1000))
    await vi.waitFor(() => expect(calls).toHaveLength(2))
    expect(await screen.findByRole('button', { name: 'Continue' })).toBeTruthy()
  })

  it('keeps asking while the server still says locked after zero', async () => {
    const calls = stubFetch(() => json(lockedWorld({ unlockAt: T0 })))
    const { store } = renderWorldAt('/world/our-forever')
    await vi.waitFor(() => expect(calls).toHaveLength(2)) // first load, then the immediate refetch at zero
    await vi.waitFor(() => expect(worldQueryStatus(store, 'our-forever')).toBe('fulfilled'))
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('Opening now')

    act(() => vi.advanceTimersByTime(RELOCK_RETRY_MS))
    await vi.waitFor(() => expect(calls).toHaveLength(3))
  })
})
