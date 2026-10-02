/** Which letters this browser has opened: `localStorage['our-story-letters-opened']` = JSON array of letter ids. */
export const OPENED_KEY = 'our-story-letters-opened'

export function readOpened(): ReadonlySet<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(OPENED_KEY) ?? '[]')
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [])
  } catch {
    return new Set()
  }
}

/** Returns the new set. Storage failures (private mode, quota) keep the in-memory state for this session. */
export function markOpened(current: ReadonlySet<string>, id: string): ReadonlySet<string> {
  if (current.has(id)) return current
  const next = new Set(current).add(id)
  try {
    localStorage.setItem(OPENED_KEY, JSON.stringify([...next]))
  } catch {
    /* remembered for this session only */
  }
  return next
}
