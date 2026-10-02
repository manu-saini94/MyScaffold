// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { api } from '../../services/api'
import themeReducer from './themeSlice'
import { parseDefaultTheme, useDefaultTheme } from './useDefaultTheme'

function setup(defaultTheme: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ serverTime: new Date().toISOString(), defaultTheme, worlds: [] }), { status: 200, headers: { 'content-type': 'application/json' } })),
  )
  const store = configureStore({
    reducer: { theme: themeReducer, [api.reducerPath]: api.reducer },
    middleware: (gd) => gd().concat(api.middleware),
  })
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
  renderHook(() => useDefaultTheme(), { wrapper })
  return store
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.dataset.theme = 'rose'
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('parseDefaultTheme', () => {
  it('accepts the two shipped themes', () => {
    expect(parseDefaultTheme('rose')).toBe('rose')
    expect(parseDefaultTheme('cinema')).toBe('cinema')
  })

  it('ignores anything else', () => {
    expect(parseDefaultTheme('neon')).toBeNull()
    expect(parseDefaultTheme(undefined)).toBeNull()
    expect(parseDefaultTheme(3)).toBeNull()
  })
})

describe('useDefaultTheme', () => {
  it('applies the server default when nothing is stored', async () => {
    const store = setup('cinema')
    await waitFor(() => expect(store.getState().theme.current).toBe('cinema'))
    expect(document.documentElement.dataset.theme).toBe('cinema')
  })

  it('leaves a stored choice alone', async () => {
    localStorage.setItem('our-story-theme', 'rose')
    const store = setup('cinema')
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 20))
    expect(store.getState().theme.current).toBe('rose')
    expect(document.documentElement.dataset.theme).toBe('rose')
  })

  it('ignores an unknown default theme', async () => {
    const store = setup('neon')
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 20))
    expect(store.getState().theme.current).toBe('rose')
    expect(localStorage.getItem('our-story-theme')).toBeNull()
  })
})
