/** Pure logic for the postcard deck: the stack state machine, the swipe decision, seeded tilts and postmark text. */

export type Dir = -1 | 1

export interface StackState {
  count: number
  /** How many cards have been sent away; the top card is moments[top]. `top === count` means the deck is done. */
  top: number
  flipped: boolean
  /** Which way the last card flew. */
  dir: Dir
  last: 'start' | 'next' | 'back' | 'shuffle'
}

export type StackAction = { type: 'next'; dir: Dir } | { type: 'back' } | { type: 'flip' } | { type: 'shuffle' }

export function initStack(count: number): StackState {
  return { count: Math.max(0, count), top: 0, flipped: false, dir: 1, last: 'start' }
}

export const isDone = (s: StackState): boolean => s.top >= s.count

/** 1-based number of the card on top, clamped to the deck ("3 / 12"). */
export const position = (s: StackState): number => Math.min(s.top + 1, s.count)

export function stackReducer(s: StackState, a: StackAction): StackState {
  switch (a.type) {
    case 'next':
      return isDone(s) ? s : { ...s, top: s.top + 1, flipped: false, dir: a.dir, last: 'next' }
    case 'back':
      return s.top === 0 ? s : { ...s, top: s.top - 1, flipped: false, last: 'back' }
    case 'flip':
      return isDone(s) ? s : { ...s, flipped: !s.flipped }
    case 'shuffle':
      return { ...s, top: 0, flipped: false, last: 'shuffle' }
  }
}

/**
 * Whether a released drag sends the card away, and which way: far enough (a share of the deck width, within sane
 * bounds), or a quick flick in the direction it was already moving.
 */
export function swipeDecision(offsetX: number, velocityX: number, deckWidth: number): Dir | null {
  const distance = Math.min(140, Math.max(60, deckWidth * 0.28))
  if (Math.abs(offsetX) >= distance) return offsetX > 0 ? 1 : -1
  if (Math.abs(velocityX) >= 450 && Math.abs(offsetX) >= 16 && Math.sign(velocityX) === Math.sign(offsetX)) {
    return velocityX > 0 ? 1 : -1
  }
  return null
}

/** A small resting tilt in degrees (-4..4), stable per id (FNV-1a hash). */
export function tiltFor(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return Math.round((((h >>> 0) % 801) / 100 - 4) * 10) / 10
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** "02 MAR 2019" for a postmark, or null when the day is missing or malformed. */
export function postmarkDate(day: string | null | undefined): string | null {
  const parts = day?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!parts) return null
  const month = MONTHS[Number(parts[2]) - 1]
  return month ? `${parts[3]} ${month} ${parts[1]}` : null
}

/** "2 March 2019" from an ISO day, or null. */
export function longDate(day: string | null | undefined): string | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const date = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)
}
