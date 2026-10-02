import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { m, useAnimationControls } from 'motion/react'
import { authApi, useUnlockMutation } from '../../services/authApi'
import { attemptsNote, pickHint } from './hints'
import { classifyUnlockError, COOKIE_ERROR, formatCountdown, GENERIC_ERROR, type UnlockOutcome } from './unlockOutcome'
import { useSecondsCountdown } from './useSecondsCountdown'
import styles from './UnlockScreen.module.scss'

type Status =
  | { kind: 'idle' }
  | { kind: 'wrong'; hint: string; note: string | null }
  | { kind: 'cooldown'; seconds: number; run: number }
  | { kind: 'ready' }
  | { kind: 'error'; message: string }
  | { kind: 'success' }

interface AnswerFormProps {
  reduced: boolean
  onUnlocked: () => void
  onNotConfigured: () => void
}

const SHAKE = { x: [0, -12, 10, -7, 4, 0], transition: { duration: 0.45, ease: 'easeOut' as const } }
const FLASH = { opacity: [0, 1, 0], transition: { duration: 0.7, ease: 'easeInOut' as const } }

function Cooldown({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const remaining = useSecondsCountdown(seconds, onDone)
  return (
    <p className={styles.timer} role="timer" aria-label="Time until you can try again">
      {formatCountdown(remaining)}
    </p>
  )
}

function StatusText({ status }: { status: Status }) {
  switch (status.kind) {
    case 'wrong':
      return (
        <>
          {status.hint}
          {status.note && <span className={styles.note}>{status.note}</span>}
        </>
      )
    case 'cooldown':
      return <>Let's pause for a moment. You can try again when the timer runs out.</>
    case 'ready':
      return <>Ready when you are.</>
    case 'error':
      return <>{status.message}</>
    case 'success':
      return <>Unlocked. Welcome in.</>
    default:
      return null
  }
}

export function AnswerForm({ reduced, onUnlocked, onNotConfigured }: AnswerFormProps) {
  const [unlock] = useUnlockMutation()
  const [checkStatus] = authApi.useLazyGetAuthStatusQuery()
  const [pending, setPending] = useState(false)
  const [answer, setAnswer] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const failures = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const shake = useAnimationControls()
  const flash = useAnimationControls()
  const inputId = useId()
  const statusId = useId()

  const locked = status.kind === 'cooldown' || status.kind === 'success'
  const endCooldown = useCallback(() => setStatus({ kind: 'ready' }), [])

  useEffect(() => {
    if (status.kind === 'ready') inputRef.current?.focus()
  }, [status.kind])

  const onWrong = (attemptsRemaining: number | undefined) => {
    setStatus({ kind: 'wrong', hint: pickHint(failures.current), note: attemptsNote(attemptsRemaining) })
    failures.current += 1
    void flash.start(FLASH)
    if (!reduced) void shake.start(SHAKE)
    inputRef.current?.select()
  }

  const onFailure = (outcome: UnlockOutcome) => {
    if (outcome.kind === 'wrong') return onWrong(outcome.attemptsRemaining)
    if (outcome.kind === 'notConfigured') return onNotConfigured()
    if (outcome.kind === 'cooldown') return setStatus({ kind: 'cooldown', seconds: outcome.retryAfterSeconds, run: Date.now() })
    setStatus({ kind: 'error', message: outcome.message })
  }

  /** Unlocks, then confirms with a fresh status read that the session cookie actually stuck. null = unlocked. */
  const attemptUnlock = async (): Promise<UnlockOutcome | null> => {
    try {
      await unlock({ answer }).unwrap()
    } catch (err) {
      return classifyUnlockError(err)
    }
    try {
      const auth = await checkStatus(undefined, false).unwrap()
      return auth?.unlocked === true ? null : { kind: 'error', message: COOKIE_ERROR }
    } catch (err) {
      return classifyUnlockError(err)
    }
  }

  const submit = async () => {
    setPending(true)
    const outcome = await attemptUnlock().finally(() => setPending(false))
    if (outcome) return onFailure(outcome)
    setStatus({ kind: 'success' })
    onUnlocked()
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!answer.trim() || pending || locked) return
    submit().catch(() => setStatus({ kind: 'error', message: GENERIC_ERROR }))
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <label htmlFor={inputId} className={styles.label}>
        Your answer
      </label>
      <m.div className={styles.field} animate={shake} data-state={status.kind}>
        <input
          ref={inputRef}
          id={inputId}
          className={styles.input}
          type="text"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          disabled={locked}
          maxLength={100}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-invalid={status.kind === 'wrong'}
          aria-describedby={statusId}
        />
        <m.span className={styles.flash} initial={{ opacity: 0 }} animate={flash} aria-hidden="true" />
        <button
          type="submit"
          className={styles.submit}
          disabled={locked || pending || !answer.trim()}
          aria-busy={pending}
          aria-label="Unlock"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </m.div>
      <p id={statusId} className={styles.status} role="status" aria-live="polite">
        <StatusText status={status} />
      </p>
      {status.kind === 'cooldown' && <Cooldown key={status.run} seconds={status.seconds} onDone={endCooldown} />}
    </form>
  )
}
