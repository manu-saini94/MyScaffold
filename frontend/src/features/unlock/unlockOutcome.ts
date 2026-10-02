import type { Problem } from '../../types/api'

export type UnlockOutcome =
  | { kind: 'wrong'; attemptsRemaining?: number }
  | { kind: 'cooldown'; retryAfterSeconds: number }
  | { kind: 'notConfigured' }
  | { kind: 'error'; message: string }

const PROBLEM_PREFIX = 'urn:ourstory:problem:'
const DEFAULT_COOLDOWN_SECONDS = 60
const MAX_DETAIL_LENGTH = 160

export const GENERIC_ERROR = 'Something went sideways. Please try again.'
export const NETWORK_ERROR = "Couldn't reach the server. Check your connection and try again."
export const COOKIE_ERROR = "That was right, but I couldn't keep you signed in on this browser. Please check that cookies are allowed, then try again."

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function nonNegative(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/** Extracts an RFC 7807 body from an RTK Query FetchBaseQueryError, or null. Every member is narrowed, never cast. */
export function readProblem(error: unknown): Problem | null {
  if (!isRecord(error) || !isRecord(error.data)) return null
  const { type, title, status, detail, attemptsRemaining, retryAfterSeconds } = error.data
  if (typeof type !== 'string' || typeof status !== 'number' || !Number.isFinite(status)) return null
  return {
    type,
    title: text(title) ?? '',
    status,
    detail: text(detail),
    attemptsRemaining: nonNegative(attemptsRemaining),
    retryAfterSeconds: nonNegative(retryAfterSeconds),
  }
}

/** "urn:ourstory:problem:unlock-failed" -> "unlock-failed"; falls back to the HTTP status for untyped problems. */
function problemCode(problem: Problem): string {
  if (problem.type.startsWith(PROBLEM_PREFIX)) return problem.type.slice(PROBLEM_PREFIX.length)
  const byStatus: Record<number, string> = { 401: 'unlock-failed', 429: 'too-many-attempts', 503: 'unlock-not-configured' }
  return byStatus[problem.status] ?? 'unknown'
}

function isNetworkError(error: unknown): boolean {
  return isRecord(error) && (error.status === 'FETCH_ERROR' || error.status === 'TIMEOUT_ERROR')
}

function safeDetail(problem: Problem): string {
  const detail = problem.detail?.trim()
  return detail ? detail.slice(0, MAX_DETAIL_LENGTH) : GENERIC_ERROR
}

/** Maps a rejected unlock (or question) request to the screen state it should produce. Pure. */
export function classifyUnlockError(error: unknown): UnlockOutcome {
  if (isNetworkError(error)) return { kind: 'error', message: NETWORK_ERROR }
  const problem = readProblem(error)
  if (!problem) return { kind: 'error', message: GENERIC_ERROR }

  switch (problemCode(problem)) {
    case 'unlock-failed':
      return { kind: 'wrong', attemptsRemaining: problem.attemptsRemaining }
    case 'too-many-attempts': {
      const seconds = problem.retryAfterSeconds
      return { kind: 'cooldown', retryAfterSeconds: seconds ? Math.ceil(seconds) : DEFAULT_COOLDOWN_SECONDS }
    }
    case 'unlock-not-configured':
      return { kind: 'notConfigured' }
    default:
      return { kind: 'error', message: safeDetail(problem) }
  }
}

/** 75 -> "1:15", 9 -> "0:09". Negative or fractional input is clamped/rounded up. */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
