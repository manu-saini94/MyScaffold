/** Contract: localStorage['our-story-progress'] = { [slug]: 0..1 }. Written by the world shell, read by the home orbs. */
export const PROGRESS_KEY = 'our-story-progress'

export type Progress = Readonly<Record<string, number>>

const NONE: Progress = Object.freeze({})

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

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
    if (typeof v === 'number' && Number.isFinite(v)) out[slug] = clamp01(v)
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

export function readProgress(): Progress {
  return parseProgress(readProgressRaw())
}

/**
 * Raise a world's progress to `value` (never lowers it). Returns false when storage is unavailable
 * (private mode, quota, disabled): progress is a nicety and must never break the world.
 */
export function recordProgress(slug: string, value: number): boolean {
  if (!Number.isFinite(value)) return false
  const current = readProgress()
  const next = clamp01(value)
  if ((current[slug] ?? 0) >= next) return true
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ ...current, [slug]: next }))
    return true
  } catch {
    return false
  }
}
