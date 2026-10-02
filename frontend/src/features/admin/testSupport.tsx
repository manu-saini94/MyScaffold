import { vi } from 'vitest'
import type { ReactElement } from 'react'
import { configureStore } from '@reduxjs/toolkit'
import { render } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import sessionReducer from '../session/sessionSlice'
import { api } from '../../services/api'

export interface Call {
  method: string
  path: string
  search: string
  headers: Headers
  body: unknown
}

export type Handler = (call: Call) => Response | undefined

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
export const noContent = () => new Response(null, { status: 204 })
export const problem = (code: string, status: number, extra: object = {}) =>
  json({ type: `urn:ourstory:problem:${code}`, title: code, status, ...extra }, status)

/** Stubs fetch at the boundary. Handlers answer in order; an unanswered request is a 404 problem and is recorded. */
export function stubFetch(...handlers: Handler[]): Call[] {
  const calls: Call[] = []
  document.cookie = 'XSRF-TOKEN=test-token; path=/'
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request) => {
      const url = new URL(input.url)
      const text = await input.clone().text()
      const call: Call = {
        method: input.method,
        path: url.pathname,
        search: url.search,
        headers: input.headers,
        body: text ? (JSON.parse(text) as unknown) : undefined,
      }
      calls.push(call)
      for (const handler of handlers) {
        const response = handler(call)
        if (response) return response
      }
      return problem('not-found', 404)
    }),
  )
  return calls
}

export function makeStore() {
  return configureStore({
    reducer: { session: sessionReducer, [api.reducerPath]: api.reducer },
    middleware: (getDefault) => getDefault().concat(api.middleware),
  })
}

export function renderAdmin(ui: ReactElement, route = '/admin') {
  const store = makeStore()
  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </Provider>,
  )
  return { store, ...view }
}

export const route =
  (method: string, path: string, respond: (call: Call) => Response): Handler =>
  (call) =>
    call.method === method && call.path === path ? respond(call) : undefined

export const ULID_A = '01HZX0000000000000000000A1'
export const ULID_B = '01HZX0000000000000000000B2'
export const ULID_C = '01HZX0000000000000000000C3'
