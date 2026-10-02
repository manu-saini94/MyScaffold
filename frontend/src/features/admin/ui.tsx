import { useId, useState, type ReactNode } from 'react'
import { describeError } from './problem'
import styles from './Admin.module.scss'

export const thumbUrl = (mediaId: string) => `/api/media/${encodeURIComponent(mediaId)}/thumb`

/** Whole-request failure. Field-level messages are shown next to their fields, not here. */
export function ProblemAlert({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <div role="alert" className={styles.alert}>
      <span>{describeError(error)}</span>
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

/** Delete button that asks first. Two plain buttons, no browser dialog. */
export function ConfirmButton({ label, confirmLabel, onConfirm, disabled, busy }: ConfirmButtonProps) {
  const [asking, setAsking] = useState(false)
  if (!asking) {
    return (
      <button type="button" className={styles.btnDanger} disabled={disabled} onClick={() => setAsking(true)}>
        {label}
      </button>
    )
  }
  return (
    <span className={styles.row} role="group" aria-label={`Confirm: ${label}`}>
      <button
        type="button"
        className={styles.btn}
        disabled={busy}
        onClick={() => {
          setAsking(false)
          onConfirm()
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" className={styles.btnGhost} onClick={() => setAsking(false)}>
        Cancel
      </button>
    </span>
  )
}
