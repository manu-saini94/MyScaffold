// Test-only helpers for the world shell tests. Never imported by app code.
import { vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { LazyMotion, domMax } from 'motion/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import sessionReducer from '../session/sessionSlice'
import { api } from '../../services/api'
import type { LockedWorldDetail, Moment, OpenWorldDetail } from '../../types/api'
import WorldRoute from './WorldRoute'

export const T0 = '2026-10-01T00:00:00.000Z'

export const moment = (i: number): Moment => ({
  id: `m${i}`,
  sortOrder: i,
  caption: `Moment ${i}`,
  note: null,
  happenedOn: null,
  place: null,
  favourite: false,
  media: { mediaId: `MEDIA${i}`, mimeType: 'image/jpeg', width: 1200, height: 900, lqip: null, dominantColor: null, takenAt: null },
})

export const openWorld = (over: Partial<OpenWorldDetail> = {}): OpenWorldDetail => ({
  slug: 'our-firsts',
  title: 'Our Firsts',
  subtitle: 'Chapter two',
  tagline: 'Every first time',
  layout: 'POLAROID_TABLE',
  themeAccent: '#d6304f',
  locked: false,
  introText: 'It started with coffee.',
  outroText: 'And then there were more.',
  musicUrl: null,
  nextSlug: 'our-forever',
  serverTime: T0,
  moments: [moment(1), moment(2), moment(3), moment(4)],
  letters: [],
  ...over,
})

export const lockedWorld = (over: Partial<LockedWorldDetail> = {}): LockedWorldDetail => ({
  slug: 'our-forever',
  title: 'Our Forever',
  subtitle: 'Soon',
  layout: 'CONSTELLATION',
  themeAccent: '#e0455a',
  locked: true,
  unlockAt: '2026-10-01T00:00:03.000Z',
  serverTime: T0,
  ...over,
})

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
export const problem = (status: number) => json({ type: 'urn:ourstory:problem:x', title: 'x', status }, status)

/** Stubs fetch at the boundary. The responder gets the path and how often that path has been asked for. */
export function stubFetch(responder: (path: string, n: number) => Response | Promise<Response>): string[] {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (req: Request) => {
      const path = new URL(req.url).pathname
      calls.push(path)
      return responder(path, calls.filter((c) => c === path).length)
    }),
  )
  return calls
}

const observers = new Set<{ cb: IntersectionObserverCallback; els: Element[] }>()

/** Puts everything currently observed on screen. */
export function showAll() {
  act(() => {
    for (const o of [...observers]) {
      o.cb(o.els.map((target) => ({ target, isIntersecting: true }) as IntersectionObserverEntry), {} as IntersectionObserver)
    }
  })
}

export function installDomStubs() {
  observers.clear()
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      entry: { cb: IntersectionObserverCallback; els: Element[] }
      constructor(cb: IntersectionObserverCallback) {
        this.entry = { cb, els: [] }
        observers.add(this.entry)
      }
      observe(el: Element) {
        this.entry.els.push(el)
      }
      unobserve() {}
      disconnect() {
        observers.delete(this.entry)
      }
    },
  )
}

export function renderWorldAt(path: string) {
  const store = configureStore({
    reducer: { session: sessionReducer, [api.reducerPath]: api.reducer },
    middleware: (gd) => gd().concat(api.middleware),
  })
  const view = render(
    <Provider store={store}>
      <LazyMotion features={domMax} strict>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/" element={<p>launcher</p>} />
            <Route path="/world/:slug" element={<WorldRoute />} />
          </Routes>
        </MemoryRouter>
      </LazyMotion>
    </Provider>,
  )
  return { ...view, store }
}

/** RTK refuses to refetch while a request for the same args is in flight; tests wait for it to settle. */
export function worldQueryStatus(store: ReturnType<typeof renderWorldAt>['store'], slug: string): string | undefined {
  return store.getState().api.queries[`getWorld("${slug}")`]?.status
}
