import { useRef } from 'react'
import { m } from 'motion/react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { useModalFocus } from '../letters/useModalFocus'
import styles from './EasterEggs.module.scss'

export const LOVE_NOTE = 'Out of every chapter, you are my favourite one.'

// sparkle positions around the card (percent of the card box) and their twinkle offsets
const SPARKS = [
  [-4, 12, 0],
  [8, -6, 0.5],
  [92, -5, 0.9],
  [104, 30, 0.3],
  [97, 96, 1.2],
  [12, 104, 0.7],
  [-6, 70, 1.5],
  [52, -9, 1.1],
] as const

/** The secret note (five quick taps on the title): a small dialog with a gold sparkle. */
export function LoveNote({ onClose }: { onClose: () => void }) {
  const reduced = useReducedMotion()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  useModalFocus(dialogRef, closeRef, onClose)

  return (
    <m.div
      className={styles.noteBackdrop}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      data-click-effect="none"
    >
      <m.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="love-note-text"
        tabIndex={-1}
        className={styles.note}
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96 }}
        transition={{ duration: reduced ? 0.25 : 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        {SPARKS.map(([x, y, delay], i) => (
          <svg
            key={i}
            viewBox="-10 -10 20 20"
            className={styles.spark}
            style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${delay}s` }}
            aria-hidden="true"
          >
            <path d="M0-10C1 -3 3-1 10 0 3 1 1 3 0 10-1 3-3 1-10 0-3-1-1-3 0-10z" />
          </svg>
        ))}
        <p className={styles.noteEyebrow}>A secret, just for you</p>
        <p id="love-note-text" className={styles.noteText}>
          {LOVE_NOTE}
        </p>
        <p className={styles.noteSign}>— Manu</p>
        <button ref={closeRef} type="button" className={styles.noteClose} onClick={onClose}>
          Keep it close
        </button>
      </m.div>
    </m.div>
  )
}
