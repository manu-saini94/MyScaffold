// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminApi } from './adminApi'
import { json, makeStore, noContent, route, stubFetch, ULID_A } from '../features/admin/testSupport'

afterEach(() => vi.unstubAllGlobals())

describe('adminApi wiring', () => {
  it('sends each admin call to the contract path with the CSRF header on mutations', async () => {
    const calls = stubFetch(() => json({ items: [], page: 0, size: 60, total: 0 }), () => noContent())
    const store = makeStore()
    await store.dispatch(adminApi.endpoints.listMedia.initiate({ page: 2, size: 60 }))
    await store.dispatch(adminApi.endpoints.deleteWorld.initiate(ULID_A))
    await store.dispatch(adminApi.endpoints.reorderWorlds.initiate([ULID_A]))
    await store.dispatch(adminApi.endpoints.signOutEveryone.initiate())
    await store.dispatch(adminApi.endpoints.resetRateLimits.initiate())

    const seen = calls.map((c) => `${c.method} ${c.path}${c.search}`)
    expect(seen).toEqual([
      'GET /api/admin/media?page=2&size=60',
      `DELETE /api/admin/worlds/${ULID_A}?confirm=true`,
      'PUT /api/admin/worlds/reorder',
      'POST /api/admin/settings/sign-out-everyone',
      'POST /api/admin/auth/reset-rate-limits',
    ])
    expect(calls[0]!.headers.get('X-XSRF-TOKEN')).toBeNull()
    for (const call of calls.slice(1)) expect(call.headers.get('X-XSRF-TOKEN')).toBe('test-token')
    expect(calls[2]!.body).toEqual({ orderedIds: [ULID_A] })
  })

  it('replaces moments with the moments wrapper body', async () => {
    const calls = stubFetch(() => noContent())
    const moments = [{ mediaId: ULID_A, caption: null, note: null, happenedOn: null, place: null, favourite: true }]
    await makeStore().dispatch(adminApi.endpoints.replaceMoments.initiate({ worldId: ULID_A, moments }))
    expect(calls[0]).toMatchObject({ method: 'PUT', path: `/api/admin/worlds/${ULID_A}/moments`, body: { moments } })
  })
})

describe('adminApi tags', () => {
  it('refetches the media list and the worlds after a photo is deleted', async () => {
    let lists = 0
    let worlds = 0
    const calls = stubFetch(
      route('GET', '/api/admin/media', () => {
        lists++
        return json({ items: [], page: 0, size: 60, total: 0 })
      }),
      route('GET', '/api/admin/worlds', () => {
        worlds++
        return json([])
      }),
      route('DELETE', `/api/admin/media/${ULID_A}`, () => noContent()),
    )
    const store = makeStore()
    store.dispatch(adminApi.endpoints.listMedia.initiate({ page: 0, size: 60 }))
    store.dispatch(adminApi.endpoints.listWorlds.initiate())
    await vi.waitFor(() => expect([lists, worlds]).toEqual([1, 1]))

    await store.dispatch(adminApi.endpoints.deleteMedia.initiate(ULID_A))
    await vi.waitFor(() => expect([lists, worlds]).toEqual([2, 2]))
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true)
  })

  it('refetches only that world\'s moments after a replace', async () => {
    let first = 0
    let second = 0
    stubFetch(
      route('GET', `/api/admin/worlds/${ULID_A}/moments`, () => (first++, json([]))),
      route('GET', '/api/admin/worlds/OTHER/moments', () => (second++, json([]))),
      route('PUT', `/api/admin/worlds/${ULID_A}/moments`, () => noContent()),
    )
    const store = makeStore()
    store.dispatch(adminApi.endpoints.getMoments.initiate(ULID_A))
    store.dispatch(adminApi.endpoints.getMoments.initiate('OTHER'))
    await vi.waitFor(() => expect([first, second]).toEqual([1, 1]))
    await store.dispatch(adminApi.endpoints.replaceMoments.initiate({ worldId: ULID_A, moments: [] }))
    await vi.waitFor(() => expect(first).toBe(2))
    expect(second).toBe(1)
  })
})
