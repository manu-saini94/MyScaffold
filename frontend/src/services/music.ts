/** Music shared by the worlds, story mode and the admin: the URL rule, bundled songs, volume ramps and the mute switch. */

export const MUTE_KEY = 'our-story-music-muted'
export const MUSIC_VOLUME = 0.7
const MAX_LENGTH = 500

/** Songs shipped in frontend/public/assets/music/ (served same-origin from /assets/music/). */
export const BUNDLED_SONGS: readonly { path: string; label: string }[] = [
  { path: '/assets/music/kadhalar-dhinam-theme.mp3', label: 'Kadhalar Dhinam (theme)' },
  { path: '/assets/music/kadhalar-dhinam-bgm.mp3', label: 'Kadhalar Dhinam (BGM)' },
  { path: '/assets/music/ed-sheeran-tenerife-sea.mp3', label: 'Ed Sheeran - Tenerife Sea' },
  { path: '/assets/music/ed-patrick-eyes-on-you.mp3', label: 'Ed Patrick - Eyes On You' },
  { path: '/assets/music/lord-huron-the-night-we-met.mp3', label: 'Lord Huron - The Night We Met' },
  { path: '/assets/music/tori-harper-after-dark.mp3', label: 'Tori Harper - After Dark' },
]

// Mirrors ContentDtos.MUSIC_URL on the server (which stays the authority).
const SONG_PATH = /^\/assets\/music\/[a-z0-9][a-z0-9-]*\.(?:mp3|m4a|ogg|opus)$/
const HTTPS = /^https:\/\/[A-Za-z0-9._:[\]-]+(?:[/?#][^\s<>"'`\\]*)?$/

function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i)
    if (c <= 0x1f || (c >= 0x7f && c <= 0x9f)) return true
  }
  return false
}

/** An https URL (no userinfo, spaces, quotes, brackets, backslashes, control characters) or a bundled song path. */
export function isMusicUrl(raw: string): boolean {
  if (raw.length > MAX_LENGTH || hasControlCharacter(raw)) return false
  return SONG_PATH.test(raw) || HTTPS.test(raw)
}

/** The world's music URL when it passes the rule (contract 3.2), else null. */
export function safeMusicUrl(raw: string | null | undefined): string | null {
  if (!raw || !isMusicUrl(raw)) return null
  if (SONG_PATH.test(raw)) return raw
  try {
    return new URL(raw).href
  } catch {
    return null
  }
}

/** Linear volume between `from` and `to`, `elapsed` ms into a `duration` ms ramp, clamped to [0, 1]. */
export function rampVolume(from: number, to: number, elapsed: number, duration: number): number {
  const t = duration <= 0 ? 1 : Math.min(1, Math.max(0, elapsed / duration))
  return Math.min(1, Math.max(0, from + (to - from) * t))
}

const FADE_STEP_MS = 50

/** Ramps `audio.volume` to `to` over `durationMs`; calls `done` at the end. Returns a cancel. */
export function fadeTo(audio: HTMLAudioElement, to: number, durationMs: number, done?: () => void): () => void {
  const from = audio.volume
  const start = Date.now()
  const id = window.setInterval(() => {
    const elapsed = Date.now() - start
    audio.volume = rampVolume(from, to, elapsed, durationMs)
    if (elapsed >= durationMs) {
      window.clearInterval(id)
      done?.()
    }
  }, FADE_STEP_MS)
  return () => window.clearInterval(id)
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
