import type { SlideView } from './playlist'

/** How long each kind of slide stays up, and how a caption types itself out. All in ms. */

export const TITLE_MS = 5200
export const LOCKED_MS = 4200
/** A photo never goes faster than this, however short its caption. */
export const MOMENT_MIN_MS = 6500
/** Time left to read a caption after its last letter lands. */
export const READ_MS = 3200

export const TYPE_DELAY_MS = 700
export const CHAR_MS = 45

/** Captions type by code point, so an emoji or accented letter never splits in half. */
export function captionChars(caption: string | null): string[] {
  return Array.from(caption?.trim() ?? '')
}

/** How many characters are showing `elapsed` ms into the slide. Reduced motion shows the whole caption at once. */
export function typedCount(length: number, elapsed: number, reduced = false): number {
  if (reduced || length === 0) return length
  if (elapsed < TYPE_DELAY_MS) return 0
  return Math.min(length, Math.floor((elapsed - TYPE_DELAY_MS) / CHAR_MS) + 1)
}

/** When the last character lands (0 for no caption). */
export function typingEndMs(length: number): number {
  return length === 0 ? 0 : TYPE_DELAY_MS + (length - 1) * CHAR_MS
}

export function momentMs(captionLength: number): number {
  return Math.max(MOMENT_MIN_MS, typingEndMs(captionLength) + READ_MS)
}

/** How long `view` stays up while playing; the final card stays until the visitor leaves. */
export function slideDuration(view: SlideView): number {
  switch (view.kind) {
    case 'title':
      return TITLE_MS
    case 'locked':
      return LOCKED_MS
    case 'moment':
      return momentMs(captionChars(view.moment.caption).length)
    case 'final':
      return Infinity
  }
}
