// Playful nudges after a wrong answer. Deliberately generic: none of them points at the answer.
export const HINTS = [
  'Not quite. The roses are still asleep.',
  'Close your eyes, think back, try again.',
  'Hmm, the petals stayed shut. One more?',
  'Not that one, but I love that you tried.',
  'Take your time. It has been waiting for you.',
] as const

/** Picks the hint for the n-th failure (0-based). Pure; consecutive failures never repeat a hint. */
export function pickHint(failureIndex: number): string {
  const i = Number.isFinite(failureIndex) ? Math.abs(Math.trunc(failureIndex)) : 0
  return HINTS[i % HINTS.length]!
}

/** A soft heads-up when few attempts remain before the cool-down; null when there is nothing worth saying. */
export function attemptsNote(attemptsRemaining: number | undefined): string | null {
  if (attemptsRemaining === undefined || attemptsRemaining > 2) return null
  if (attemptsRemaining <= 0) return 'That was the last try for a little while.'
  if (attemptsRemaining === 1) return 'One more try before a short pause.'
  return `${attemptsRemaining} more tries before a short pause.`
}
