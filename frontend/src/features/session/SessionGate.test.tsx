// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { api } from '../../services/api'
import { experienceApi } from '../../services/experienceApi'
import sessionReducer, { chooseProfile, statusResolved, unlocked } from './sessionSlice'
import { SessionGate } from './SessionGate'

function makeStore() {
  return configureStore({
    reducer: { session: sessionReducer, [api.reducerPath]: api.reducer },
    middleware: (gd) => gd().concat(api.middleware),
  })
}

function renderAt(path: string, store = makeStore()) {
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/unlock"
            element={
              <SessionGate route="unlock">
                <p>unlock screen</p>
              </SessionGate>
            }
          />
          <Route
            path="/who"
            element={
              <SessionGate route="who">
                <p>who screen</p>
              </SessionGate>
            }
          />
          <Route
            path="/"
            element={
              <SessionGate route="app">
                <p>launcher</p>
              </SessionGate>
            }
          />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
  return store
}

function stubStatus(result: boolean | 'error') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      result === 'error'
        ? new Response(null, { status: 500 })
        : new Response(JSON.stringify({ unlocked: result }), { status: 200, headers: { 'content-type': 'application/json' } }),
    ),
  )
}

beforeEach(() => sessionStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('SessionGate', () => {
  it('renders nothing while the status is unknown', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    renderAt('/')
    expect(screen.queryByText('launcher')).toBeNull()
    expect(screen.queryByText('unlock screen')).toBeNull()
  })

  it('locked: the app redirects to /unlock', async () => {
    stubStatus(false)
    renderAt('/')
    expect(await screen.findByText('unlock screen')).toBeTruthy()
  })

  it('locked: /who redirects to /unlock', async () => {
    stubStatus(false)
    renderAt('/who')
    expect(await screen.findByText('unlock screen')).toBeTruthy()
  })

  it('locked: /unlock shows the unlock screen', async () => {
    stubStatus(false)
    renderAt('/unlock')
    expect(await screen.findByText('unlock screen')).toBeTruthy()
  })

  it('unlocked without a profile: the app redirects to /who', async () => {
    stubStatus(true)
    renderAt('/')
    expect(await screen.findByText('who screen')).toBeTruthy()
  })

  it('unlocked without a profile: /unlock redirects to /who', async () => {
    stubStatus(true)
    renderAt('/unlock')
    expect(await screen.findByText('who screen')).toBeTruthy()
  })

  it('unlocked with profile her: the app renders the launcher', async () => {
    stubStatus(true)
    const store = makeStore()
    store.dispatch(chooseProfile('her'))
    renderAt('/', store)
    expect(await screen.findByText('launcher')).toBeTruthy()
  })

  it('unlocked with profile her: /unlock still goes to /who', async () => {
    stubStatus(true)
    const store = makeStore()
    store.dispatch(chooseProfile('her'))
    renderAt('/unlock', store)
    expect(await screen.findByText('who screen')).toBeTruthy()
  })

  it('unlocking while on /unlock keeps the screen so its bloom can finish', async () => {
    stubStatus(false)
    const store = renderAt('/unlock')
    expect(await screen.findByText('unlock screen')).toBeTruthy()
    act(() => {
      store.dispatch(unlocked())
    })
    expect(screen.getByText('unlock screen')).toBeTruthy()
    expect(screen.queryByText('who screen')).toBeNull()
  })

  it('a server that says locked wipes a stale profile', async () => {
    stubStatus(false)
    const store = makeStore()
    store.dispatch(chooseProfile('her'))
    store.dispatch(statusResolved(true))
    renderAt('/who', store)
    await waitFor(() => expect(store.getState().session).toEqual({ status: 'locked', profile: null }))
  })

  it('offers a retry when the status call fails', async () => {
    stubStatus('error')
    renderAt('/')
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('after a viewer 401 the cached unlocked status cannot bring the session back', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (req: Request) => {
        const p = new URL(req.url).pathname
        if (p === '/api/auth/status') return new Response(JSON.stringify({ unlocked: statusNow }), { status: 200, headers: { 'content-type': 'application/json' } })
        return new Response(JSON.stringify({ status: 401 }), { status: 401, headers: { 'content-type': 'application/json' } })
      }),
    )
    let statusNow = true
    const store = makeStore()
    renderAt('/who', store)
    expect(await screen.findByText('who screen')).toBeTruthy()
    expect(store.getState().session.status).toBe('unlocked')

    statusNow = false // the server revoked the session
    await store.dispatch(experienceApi.endpoints.getExperience.initiate())
    expect(store.getState().session.status).toBe('locked')
    expect(Object.keys(store.getState().api.queries).some((k) => k.startsWith("getExperience"))).toBe(false)

    cleanup()
    renderAt('/unlock', store)
    expect(await screen.findByText('unlock screen')).toBeTruthy()
    expect(store.getState().session.status).toBe('locked')
    expect(Object.keys(store.getState().api.queries).some((k) => k.startsWith('getExperience'))).toBe(false)
  })
})
