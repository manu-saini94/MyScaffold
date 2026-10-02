import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { ThemeName } from '../../types/world'

const STORAGE_KEY = 'our-story-theme'

export function readStoredTheme(): ThemeName {
  return document.documentElement.dataset.theme === 'cinema' ? 'cinema' : 'rose'
}

/** True when the visitor (or an earlier default) already stored a theme in localStorage. */
export function hasStoredTheme(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'rose' || v === 'cinema'
  } catch {
    return false
  }
}

/** Writes the theme to <html> and localStorage. Safe if storage is blocked. */
export function applyTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'rose' ? '#ffffff' : '#141414')
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* private mode: theme still applies for this session */
  }
}

const themeSlice = createSlice({
  name: 'theme',
  initialState: { current: readStoredTheme() } as { current: ThemeName },
  reducers: {
    setTheme(state, action: PayloadAction<ThemeName>) {
      state.current = action.payload
    },
  },
})

export const { setTheme } = themeSlice.actions
export const selectTheme = (s: { theme: { current: ThemeName } }) => s.theme.current
export default themeSlice.reducer
