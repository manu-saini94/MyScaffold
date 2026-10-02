/** Story music helpers: URL check, volume ramps and the remembered mute switch. */

export const MUTE_KEY = 'our-story-music-muted'
export const MUSIC_VOLUME = 0.7
export const FADE_MS = 1400

/** The world's music URL only when it is a plain https URL (contract 3.2), else null. */
export function safeMusicUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null
  return url.href
}

/** Linear volume between `from` and `to`, `elapsed` ms into a `duration` ms ramp, clamped to [0, 1]. */
export function rampVolume(from: number, to: number, elapsed: number, duration: number): number {
  const t = duration <= 0 ? 1 : Math.min(1, Math.max(0, elapsed / duration))
  return Math.min(1, Math.max(0, from + (to - from) * t))
}

export function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
  } catch {
    // storage blocked (private mode): the switch still works for this visit
  }
}
