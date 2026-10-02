/** Contract: localStorage['our-story-progress'] = { [slug]: 0..1 }. Written by the world shell, read by the home orbs. */
export const PROGRESS_KEY = 'our-story-progress'

export type Progress = Readonly<Record<string, number>>

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

export function readProgress(): Progress {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1])).map(([k, v]) => [k, clamp01(v)]),
    )
  } catch {
    return {}
  }
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
