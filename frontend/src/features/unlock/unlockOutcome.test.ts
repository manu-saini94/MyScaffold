import { describe, expect, it } from 'vitest'
import { classifyUnlockError, formatCountdown, GENERIC_ERROR, NETWORK_ERROR, readProblem } from './unlockOutcome'

const problem = (code: string, status: number, extra: object = {}) => ({
  status,
  data: { type: `urn:ourstory:problem:${code}`, title: code, status, ...extra },
})

describe('classifyUnlockError', () => {
  it('maps each problem type to its screen state', () => {
    expect(classifyUnlockError(problem('unlock-failed', 401, { attemptsRemaining: 2 }))).toEqual({
      kind: 'wrong',
      attemptsRemaining: 2,
    })
    expect(classifyUnlockError(problem('too-many-attempts', 429, { retryAfterSeconds: 42.2 }))).toEqual({
      kind: 'cooldown',
      retryAfterSeconds: 43,
    })
    expect(classifyUnlockError(problem('unlock-not-configured', 503))).toEqual({ kind: 'notConfigured' })
    expect(classifyUnlockError(problem('validation-failed', 400, { detail: 'Answer is required.' }))).toEqual({
      kind: 'error',
      message: 'Answer is required.',
    })
  })

  it('falls back safely when fields are missing or odd', () => {
    expect(classifyUnlockError(problem('too-many-attempts', 429))).toEqual({ kind: 'cooldown', retryAfterSeconds: 60 })
    expect(classifyUnlockError(problem('validation-failed', 400))).toEqual({ kind: 'error', message: GENERIC_ERROR })
    expect(classifyUnlockError(problem('validation-failed', 400, { detail: 'x'.repeat(500) }))).toMatchObject({
      message: 'x'.repeat(160),
    })
    expect(classifyUnlockError({ status: 401, data: { type: 'about:blank', title: 'x', status: 401 } })).toEqual({
      kind: 'wrong',
      attemptsRemaining: undefined,
    })
  })

  it('narrows hostile or malformed members instead of trusting them', () => {
    expect(classifyUnlockError(problem('validation-failed', 400, { detail: { html: '<b>x</b>' } }))).toEqual({
      kind: 'error',
      message: GENERIC_ERROR,
    })
    expect(classifyUnlockError(problem('unlock-failed', 401, { attemptsRemaining: '1' }))).toEqual({
      kind: 'wrong',
      attemptsRemaining: undefined,
    })
    expect(classifyUnlockError(problem('unlock-failed', 401, { attemptsRemaining: -1 }))).toEqual({
      kind: 'wrong',
      attemptsRemaining: undefined,
    })
    for (const bad of ['30', Number.NaN, Number.POSITIVE_INFINITY, -5, 0]) {
      expect(classifyUnlockError(problem('too-many-attempts', 429, { retryAfterSeconds: bad }))).toEqual({
        kind: 'cooldown',
        retryAfterSeconds: 60,
      })
    }
    expect(readProblem({ status: 401, data: { type: 'x', status: 'nope' } })).toBeNull()
    expect(readProblem({ status: 401, data: { type: 'x', status: 401, title: 7 } })).toEqual({
      type: 'x',
      title: '',
      status: 401,
      detail: undefined,
      attemptsRemaining: undefined,
      retryAfterSeconds: undefined,
    })
  })

  it('treats network failures and non-problem errors as short safe messages', () => {
    expect(classifyUnlockError({ status: 'FETCH_ERROR', error: 'TypeError' })).toEqual({ kind: 'error', message: NETWORK_ERROR })
    expect(classifyUnlockError({ status: 500, data: '<html>' })).toEqual({ kind: 'error', message: GENERIC_ERROR })
    expect(classifyUnlockError(undefined)).toEqual({ kind: 'error', message: GENERIC_ERROR })
  })
})

describe('formatCountdown', () => {
  it('formats minutes and zero-padded seconds', () => {
    expect(formatCountdown(75)).toBe('1:15')
    expect(formatCountdown(9)).toBe('0:09')
    expect(formatCountdown(-4)).toBe('0:00')
    expect(formatCountdown(0.2)).toBe('0:01')
  })
})
