import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useDispatch } from 'react-redux'
import { describeError, errorStatus } from './problem'
import { invalidateAdminMe } from './sessionApi'
import styles from './Admin.module.scss'

const GOOGLE_LOGIN = '/oauth2/authorization/google'

/** Whole-request failure. Field-level messages are shown next to their fields, not here. */
export function ProblemAlert({ error }: { error: unknown }) {
  const dispatch = useDispatch()
  const expired = errorStatus(error) === 401
  // An expired Google session: make AdminApp re-check who is signed in so it falls back to the sign-in state.
  useEffect(() => {
    if (expired) dispatch(invalidateAdminMe())
  }, [expired, dispatch])
  if (!error) return null
  return (
    <div role="alert" className={styles.alert}>
      <span>{describeError(error)}</span>
      {expired && (
        <a className={styles.btn} href={GOOGLE_LOGIN}>
          Sign in again
        </a>
      )}
    </div>
  )
}

interface FieldProps {
  label: string
  error?: string
  hint?: string
  className?: string
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby': string | undefined }) => ReactNode
}

/** Label + control + inline error. The control receives its id and ARIA wiring through the render prop. */
export function Field({ label, error, hint, className, children }: FieldProps) {
  const id = useId()
  const noteId = `${id}-note`
  const note = error ?? hint
  return (
    <div className={`${styles.field} ${className ?? ''}`}>
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': note ? noteId : undefined })}
      {note && (
        <span id={noteId} className={error ? styles.fieldError : styles.muted}>
          {note}
        </span>
      )}
    </div>
  )
}

interface ConfirmButtonProps {
  label: string
  confirmLabel: string
  onConfirm: () => void
  disabled?: boolean
  busy?: boolean
}

/** Delete button that asks first. Two plain buttons, no browser dialog. Focus moves into the question and back to the trigger. */
export function ConfirmButton({ label, confirmLabel, onConfirm, disabled, busy }: ConfirmButtonProps) {
  const [asking, setAsking] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const confirm = useRef<HTMLButtonElement>(null)
  const moved = useRef(false)

  // The focused button unmounts on every switch, which would drop focus to <body>; hand it to the one that replaces it.
  useEffect(() => {
    if (!moved.current) return
    ;(asking ? confirm : trigger).current?.focus()
  }, [asking])

  const switchTo = (next: boolean) => {
    moved.current = true
    setAsking(next)
  }

  if (!asking) {
    return (
      <button ref={trigger} type="button" className={styles.btnDanger} disabled={disabled} onClick={() => switchTo(true)}>
        {label}
      </button>
    )
  }
  return (
    <span className={styles.row} role="group" aria-label={`Confirm: ${label}`}>
      <button
        ref={confirm}
        type="button"
        className={styles.btn}
        disabled={busy}
        onClick={() => {
          switchTo(false)
          onConfirm()
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" className={styles.btnGhost} onClick={() => switchTo(false)}>
        Cancel
      </button>
    </span>
  )
}
