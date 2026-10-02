// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { api } from '../../services/api'
import { resetServerClock } from '../../services/serverClock'
import sessionReducer from '../session/sessionSlice'
import { isWorldLocked, useWorldList } from './useWorlds'

const T0 = Date.parse('2026-10-01T00:00:00Z')

function experience(over: object = {}) {
  return {
    serverTime: new Date(Date.now()).toISOString(),
    appTitle: 'Our Story',
    tagline: null,
    defaultTheme: 'rose',
    specialDate: null,
    easterEggNicknames: [],
    profiles: [],
    hero: [],
    worlds: [],
    ...over,
  }
}

const lockedWorld = (inMs: number) => ({
  slug: 'our-forever',
  title: 'Our Forever',
  subtitle: null,
  layout: 'CONSTELLATION',
  themeAccent: null,
  sortOrder: 1,
  locked: true,
  unlockAt: new Date(Date.now() + inMs).toISOString(),
})

const openWorld = {
  slug: 'our-forever',
  title: 'Our Forever',
  subtitle: null,
  layout: 'CONSTELLATION',
  themeAccent: null,
  sortOrder: 1,
  locked: false,
  tagline: null,
  momentCount: 3,
  cover: null,
  previewMediaIds: [],
}

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

function wrapper() {
  const store = configureStore({
    reducer: { session: sessionReducer, [api.reducerPath]: api.reducer },
    middleware: (gd) => gd().concat(api.middleware),
  })
  return ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  // Only Date is frozen (so unlock delays are exact); fetch and the store run on real timers.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  resetServerClock()
})

/** The refetch timer useWorldList scheduled with exactly this delay, if any. */
function scheduled(spy: ReturnType<typeof vi.spyOn>, delay: number) {
  return spy.mock.calls.find((c: unknown[]) => c[1] === delay) as [() => void, number] | undefined
}

describe('useWorldList', () => {
  it('maps the experience worlds', async () => {
    fetchMock = vi.fn(async () => ok(experience({ worlds: [openWorld] })))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useWorldList(), { wrapper: wrapper() })
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.worlds.map((w) => w.slug)).toEqual(['our-forever'])
  })

  it('keeps a teaser locked until fresh data arrives; refetches one second after the unlock instant, then opens it', async () => {
    const spy = vi.spyOn(window, 'setTimeout')
    let n = 0
    fetchMock = vi.fn(async () => {
      n += 1
      return ok(experience({ worlds: [n === 1 ? lockedWorld(5000) : openWorld] }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useWorldList(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.worlds).toHaveLength(1))
    expect(isWorldLocked(result.current.worlds[0]!)).toBe(true)

    const timer = scheduled(spy, 6000)
    expect(timer).toBeDefined()
    vi.setSystemTime(T0 + 5500) // past the unlock instant, refetch not delivered yet: still locked
    expect(isWorldLocked(result.current.worlds[0]!)).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await act(async () => timer![0]())
    await waitFor(() => expect(isWorldLocked(result.current.worlds[0]!)).toBe(false))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current.worlds[0]!.photoCount).toBe(3)
  })

  it('cancels the pending refetch on unmount', async () => {
    const spy = vi.spyOn(window, 'setTimeout')
    const clear = vi.spyOn(window, 'clearTimeout')
    fetchMock = vi.fn(async () => ok(experience({ worlds: [lockedWorld(5000)] })))
    vi.stubGlobal('fetch', fetchMock)
    const { result, unmount } = renderHook(() => useWorldList(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.worlds).toHaveLength(1))
    const id = spy.mock.results[spy.mock.calls.findIndex((c) => c[1] === 6000)]!.value
    unmount()
    expect(clear).toHaveBeenCalledWith(id)
  })

  it('clamps a far-off unlock to the largest timer delay instead of firing at once', async () => {
    const spy = vi.spyOn(window, 'setTimeout')
    fetchMock = vi.fn(async () => ok(experience({ worlds: [lockedWorld(200 * 86_400_000)] })))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useWorldList(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.worlds).toHaveLength(1))
    expect(scheduled(spy, 2 ** 31 - 1)).toBeDefined()
  })

  it('exposes a failed load and recovers on refetch', async () => {
    let fail = true
    fetchMock = vi.fn(async () => (fail ? new Response(null, { status: 500 }) : ok(experience({ worlds: [openWorld] }))))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useWorldList(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.worlds).toEqual([])

    fail = false
    act(() => result.current.refetch())
    await waitFor(() => expect(result.current.worlds).toHaveLength(1))
    expect(result.current.isError).toBe(false)
  })
})
