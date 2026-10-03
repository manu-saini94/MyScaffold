import { readStoredTheme, THEME_COLOR } from '../theme/themeSlice'

/**
 * The hidden "midnight" look (Konami code). Kept apart from the theme slice: it is an overlay on whichever theme is
 * active, carried by <html data-midnight="true"> and styled in midnight.scss. Persisted like the theme.
 */
export const MIDNIGHT_KEY = 'our-story-midnight'
const MIDNIGHT_BG = '#0c0e2a'

export function isMidnight(): boolean {
  return document.documentElement.dataset.midnight === 'true'
}

function apply(on: boolean): void {
  const root = document.documentElement
  const meta = document.querySelector('meta[name="theme-color"]')
  if (on) {
    root.dataset.midnight = 'true'
    meta?.setAttribute('content', MIDNIGHT_BG)
  } else {
    delete root.dataset.midnight
    // derived from the theme, not remembered: the pre-paint script may have set data-midnight before we ever ran
    meta?.setAttribute('content', THEME_COLOR[readStoredTheme()])
  }
}

/** Turns midnight on or off and remembers the choice. Safe if storage is blocked. */
export function setMidnight(on: boolean): void {
  apply(on)
  try {
    if (on) localStorage.setItem(MIDNIGHT_KEY, 'true')
    else localStorage.removeItem(MIDNIGHT_KEY)
  } catch {
    /* applies for this session only */
  }
}

export function toggleMidnight(): boolean {
  const next = !isMidnight()
  setMidnight(next)
  return next
}

/** Re-applies a stored midnight choice (on app start). */
export function restoreMidnight(): void {
  try {
    if (localStorage.getItem(MIDNIGHT_KEY) === 'true') apply(true)
  } catch {
    /* nothing stored we can read */
  }
}
