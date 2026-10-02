import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react'
import { sessionLost } from '../features/session/sessionSlice'

// Absolute so the base resolves the same in browsers and in jsdom (Request rejects relative URLs outside a page).
const BASE_URL = `${typeof location === 'undefined' ? '' : location.origin}/api`
const XSRF_COOKIE = 'XSRF-TOKEN'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const VIEWER_PREFIXES = ['/worlds/', '/media/']

const rawBaseQuery = fetchBaseQuery({ baseUrl: BASE_URL, credentials: 'include' })

export function readXsrfToken(): string | null {
  if (typeof document === 'undefined') return null
  for (const part of document.cookie.split(';')) {
    const eq = part.indexOf('=')
    if (eq > 0 && part.slice(0, eq).trim() === XSRF_COOKIE) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim())
      } catch {
        return null
      }
    }
  }
  return null
}

function isViewerUrl(url: string): boolean {
  const path = (url.startsWith('/') ? url : `/${url}`).split('?')[0]!
  return path === '/experience' || VIEWER_PREFIXES.some((p) => path.startsWith(p))
}

/** CSRF 403 bodies are empty or generic (contract 1.2); our own errors are typed problems and must not be retried. */
function isTypedProblem(data: unknown): boolean {
  const type = (data as { type?: unknown } | null)?.type
  return typeof type === 'string' && type.startsWith('urn:ourstory:problem:')
}

function withXsrf(args: FetchArgs, token: string | null): FetchArgs {
  if (!token) return args
  const headers = new Headers(args.headers as HeadersInit | undefined)
  headers.set('X-XSRF-TOKEN', token)
  return { ...args, headers }
}

/**
 * CSRF (contract 1.2): every mutation carries X-XSRF-TOKEN from the XSRF-TOKEN cookie. A missing cookie is
 * obtained with GET /auth/question first. One untyped 403 (a typed Problem is a real refusal) re-reads the cookie and retries exactly once.
 * 401 from a viewer endpoint means the session is gone (contract 5.4): lock the session and drop every cached
 * response, so a cached `unlocked:true` status can never bring the session back.
 */
const baseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (args, bqApi, extra) => {
  const fetchArgs: FetchArgs = typeof args === 'string' ? { url: args } : args
  const mutating = !SAFE_METHODS.has((fetchArgs.method ?? 'GET').toUpperCase())

  let result
  if (mutating) {
    if (!readXsrfToken()) await rawBaseQuery('/auth/question', bqApi, extra)
    result = await rawBaseQuery(withXsrf(fetchArgs, readXsrfToken()), bqApi, extra)
    if (result.error?.status === 403 && !isTypedProblem(result.error.data)) {
      if (!readXsrfToken()) await rawBaseQuery('/auth/question', bqApi, extra)
      result = await rawBaseQuery(withXsrf(fetchArgs, readXsrfToken()), bqApi, extra)
    }
  } else {
    result = await rawBaseQuery(fetchArgs, bqApi, extra)
  }

  if (result.error?.status === 401 && isViewerUrl(fetchArgs.url)) {
    bqApi.dispatch(sessionLost())
    bqApi.dispatch(api.util.resetApiState())
  }
  return result
}

// Base API. Endpoints are added with injectEndpoints (authApi.ts, experienceApi.ts).
export const api = createApi({
  reducerPath: 'api',
  baseQuery,
  tagTypes: ['Session', 'Experience', 'World'],
  endpoints: () => ({}),
})
