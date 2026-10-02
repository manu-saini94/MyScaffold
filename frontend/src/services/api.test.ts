// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import sessionReducer, { chooseProfile, unlocked } from '../features/session/sessionSlice'
import { api } from './api'
import { authApi } from './authApi'
import { experienceApi } from './experienceApi'
import { resetServerClock, serverNow } from './serverClock'

type Responder = (req: Request, n: number) => Response

function makeStore() {
  return configureStore({
    reducer: { session: sessionReducer, [api.reducerPath]: api.reducer },
    middleware: (gd) => gd().concat(api.middleware),
  })
}

function clearCookie() {
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
}

let requests: Request[]
function stubFetch(responder: Responder) {
  requests = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request) => {
      requests.push(input.clone())
      return responder(input, requests.length)
    }),
  )
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const noContent = () => new Response(null, { status: 204 })
const path = (r: Request) => new URL(r.url).pathname
const unlock = (s: ReturnType<typeof makeStore>) => s.dispatch(authApi.endpoints.unlock.initiate({ answer: 'Sample' }))

beforeEach(() => {
  clearCookie()
  sessionStorage.clear()
})
afterEach(() => {
  vi.unstubAllGlobals()
  resetServerClock()
})

describe('CSRF header', () => {
  it('sends X-XSRF-TOKEN from the cookie on a mutation, with the body', async () => {
    document.cookie = 'XSRF-TOKEN=tok-1; path=/'
    stubFetch(() => noContent())
    await unlock(makeStore())
    expect(requests).toHaveLength(1)
    expect(requests[0]!.method).toBe('POST')
    expect(requests[0]!.headers.get('X-XSRF-TOKEN')).toBe('tok-1')
    expect(await requests[0]!.text()).toBe('{"answer":"Sample"}')
  })

  it('does not send it on a GET', async () => {
    document.cookie = 'XSRF-TOKEN=tok-1; path=/'
    stubFetch(() => json({ unlocked: false }))
    await makeStore().dispatch(authApi.endpoints.getAuthStatus.initiate())
    expect(requests[0]!.headers.get('X-XSRF-TOKEN')).toBeNull()
  })

  it('fetches GET /auth/question first when the cookie is absent', async () => {
    stubFetch((req) => {
      if (path(req) === '/api/auth/question') {
        document.cookie = 'XSRF-TOKEN=fresh; path=/'
        return json({ question: 'q?' })
      }
      return noContent()
    })
    await unlock(makeStore())
    expect(requests.map((r) => `${r.method} ${path(r)}`)).toEqual(['GET /api/auth/question', 'POST /api/auth/unlock'])
    expect(requests[1]!.headers.get('X-XSRF-TOKEN')).toBe('fresh')
  })

  it('retries exactly once after a 403, with the re-read cookie', async () => {
    document.cookie = 'XSRF-TOKEN=stale; path=/'
    stubFetch((_req, n) => {
      if (n === 1) {
        document.cookie = 'XSRF-TOKEN=rotated; path=/'
        return new Response(null, { status: 403 })
      }
      return noContent()
    })
    const res = await unlock(makeStore())
    expect(requests).toHaveLength(2)
    expect(requests[0]!.headers.get('X-XSRF-TOKEN')).toBe('stale')
    expect(requests[1]!.headers.get('X-XSRF-TOKEN')).toBe('rotated')
    expect(res.error).toBeUndefined()
  })

  it('does not retry a 403 that is a typed Problem (a real refusal, not a CSRF miss)', async () => {
    document.cookie = 'XSRF-TOKEN=tok; path=/'
    const problem = { type: 'urn:ourstory:problem:forbidden', title: 'Forbidden', status: 403 }
    stubFetch(() => json(problem, 403))
    const res = await unlock(makeStore())
    expect(requests).toHaveLength(1)
    expect(res.error).toMatchObject({ status: 403, data: problem })
  })

  it('retries a generic 403 body (Spring default shape without a problem type)', async () => {
    document.cookie = 'XSRF-TOKEN=tok; path=/'
    stubFetch((_req, n) => (n === 1 ? json({ status: 403, error: 'Forbidden' }, 403) : noContent()))
    const res = await unlock(makeStore())
    expect(requests).toHaveLength(2)
    expect(res.error).toBeUndefined()
  })

  it('gives up after the single retry when the 403 persists', async () => {
    document.cookie = 'XSRF-TOKEN=tok; path=/'
    stubFetch(() => new Response(null, { status: 403 }))
    const res = await unlock(makeStore())
    expect(requests).toHaveLength(2)
    expect(res.error).toMatchObject({ status: 403 })
  })
})

describe('session loss', () => {
  it('a 401 from /experience dispatches sessionLost', async () => {
    stubFetch(() => json({ status: 401 }, 401))
    const store = makeStore()
    store.dispatch(unlocked())
    store.dispatch(chooseProfile('her'))
    await store.dispatch(experienceApi.endpoints.getExperience.initiate())
    expect(store.getState().session).toEqual({ status: 'locked', profile: null })
  })

  it('a viewer 401 also drops the cached auth status', async () => {
    stubFetch((req) => (path(req) === '/api/auth/status' ? json({ unlocked: true }) : json({ status: 401 }, 401)))
    const store = makeStore()
    await store.dispatch(authApi.endpoints.getAuthStatus.initiate())
    await store.dispatch(experienceApi.endpoints.getExperience.initiate())
    expect(Object.keys(store.getState().api.queries)).toHaveLength(0)
  })

  it('a 401 from /worlds/{slug} dispatches sessionLost', async () => {
    stubFetch(() => json({ status: 401 }, 401))
    const store = makeStore()
    store.dispatch(unlocked())
    await store.dispatch(experienceApi.endpoints.getWorld.initiate('our-firsts'))
    expect(store.getState().session.status).toBe('locked')
  })

  it('a 401 from unlock (wrong answer) is a Problem for the caller, not a session loss', async () => {
    document.cookie = 'XSRF-TOKEN=tok; path=/'
    const problem = { type: 'urn:ourstory:problem:unlock-failed', title: 'Unauthorized', status: 401, attemptsRemaining: 3 }
    stubFetch(() => json(problem, 401))
    const store = makeStore()
    const res = await unlock(store)
    expect(res.error).toMatchObject({ status: 401, data: problem })
    expect(store.getState().session.status).toBe('unknown')
  })
})

describe('auth and experience endpoints', () => {
  it('unlock success marks the session unlocked', async () => {
    document.cookie = 'XSRF-TOKEN=tok; path=/'
    stubFetch(() => noContent())
    const store = makeStore()
    await unlock(store)
    expect(store.getState().session.status).toBe('unlocked')
  })

  it('lock success locks the session and drops cached api state', async () => {
    document.cookie = 'XSRF-TOKEN=tok; path=/'
    stubFetch((req) => (path(req) === '/api/auth/status' ? json({ unlocked: true }) : noContent()))
    const store = makeStore()
    store.dispatch(unlocked())
    await store.dispatch(authApi.endpoints.getAuthStatus.initiate())
    await store.dispatch(authApi.endpoints.lock.initiate())
    expect(store.getState().session.status).toBe('locked')
    expect(Object.keys(store.getState().api.queries)).toHaveLength(0)
  })

  it('a failed lock leaves the session alone', async () => {
    document.cookie = 'XSRF-TOKEN=tok; path=/'
    stubFetch(() => new Response(null, { status: 500 }))
    const store = makeStore()
    store.dispatch(unlocked())
    await store.dispatch(authApi.endpoints.lock.initiate())
    expect(store.getState().session.status).toBe('unlocked')
  })

  it('experience load sets the server clock offset', async () => {
    const serverTime = new Date(Date.now() + 3_600_000).toISOString()
    stubFetch(() => json({ serverTime, worlds: [] }))
    await makeStore().dispatch(experienceApi.endpoints.getExperience.initiate())
    expect(Math.abs(serverNow() - Date.parse(serverTime))).toBeLessThan(2000)
  })
})
