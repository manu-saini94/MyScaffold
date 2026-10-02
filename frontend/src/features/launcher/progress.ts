/** Reading progress per world, written by the world shell: localStorage['our-story-progress'] = { [slug]: 0..1 }. */
export const PROGRESS_KEY = 'our-story-progress'

export type Progress = Readonly<Record<string, number>>

const NONE: Progress = Object.freeze({})

/** Pure: tolerant parse. Anything malformed is dropped; numbers are clamped to 0..1. */
export function parseProgress(raw: string | null | undefined): Progress {
  if (!raw) return NONE
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return NONE
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return NONE
  const out: Record<string, number> = {}
  for (const [slug, v] of Object.entries(data)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[slug] = Math.min(1, Math.max(0, v))
  }
  return out
}

/** The raw stored string, or null when storage is empty or blocked (private mode, sandboxed iframe). */
export function readProgressRaw(): string | null {
  try {
    return localStorage.getItem(PROGRESS_KEY)
  } catch {
    return null
  }
}
