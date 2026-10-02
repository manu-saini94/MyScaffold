/** Pure key/tap sequence matching for the easter eggs. No DOM, no clock: callers pass keys and timestamps in. */

/** Lower-cased, trimmed, de-duplicated nicknames; blanks dropped. */
export function normalizeNicknames(nicknames: readonly string[]): string[] {
  return [...new Set(nicknames.map((n) => n.trim().toLowerCase()).filter((n) => n.length > 0))]
}

/**
 * Appends a typed character to the rolling buffer, keeping only the last `max` characters.
 * Non-character keys (Shift, ArrowUp, Enter...) leave the buffer as it is.
 */
export function pushTyped(buffer: string, key: string, max: number): string {
  if (key.length !== 1 || max <= 0) return buffer
  return (buffer + key.toLowerCase()).slice(-max)
}

/** The nickname the buffer now ends with, if any (nicknames must already be normalised). */
export function matchNickname(buffer: string, nicknames: readonly string[]): string | null {
  return nicknames.find((n) => buffer.endsWith(n)) ?? null
}

export const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'] as const

/** Rolling window of the last KONAMI.length keys (letters lower-cased, so Shift+B still counts). */
export function pushKonami(history: readonly string[], key: string): string[] {
  const k = key.length === 1 ? key.toLowerCase() : key
  return [...history, k].slice(-KONAMI.length)
}

export function isKonami(history: readonly string[]): boolean {
  return history.length === KONAMI.length && history.every((k, i) => k === KONAMI[i])
}

export const TAP_WINDOW_MS = 3000
export const TAPS_NEEDED = 5

/**
 * Registers a tap at `now` (ms). Fires once `needed` taps fall inside `windowMs`; firing clears the taps so the
 * next burst has to start over.
 */
export function registerTap(
  taps: readonly number[],
  now: number,
  windowMs: number = TAP_WINDOW_MS,
  needed: number = TAPS_NEEDED,
): { taps: number[]; fired: boolean } {
  const recent = [...taps.filter((t) => now - t < windowMs), now]
  return recent.length >= needed ? { taps: [], fired: true } : { taps: recent, fired: false }
}
