import { lazy, Suspense, useCallback, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence } from 'motion/react'
import { safeHex } from '../../services/media'
import type { Letter } from '../../types/api'
import { markOpened, readOpened } from './openedStore'

// react-markdown and the seal-break scene load only when a letter is opened
const LetterDialog = lazy(() => import('./LetterDialog'))

/** Inline style carrying the world accent into the seal (and through portals, which leave the world frame). */
export function sealStyle(accent: string | null | undefined): CSSProperties | undefined {
  const hex = safeHex(accent)
  return hex ? ({ '--seal': hex } as CSSProperties) : undefined
}

interface Reading {
  letter: Letter
  /** Play the wax-seal break: only the first time this browser opens the letter. */
  breakSeal: boolean
}

/** Opened-letter memory plus the (portalled, lazy) reading dialog. */
export function useLetterReader(accent: string | null | undefined): {
  opened: ReadonlySet<string>
  open: (letter: Letter) => void
  dialog: ReactNode
} {
  const [opened, setOpened] = useState(readOpened)
  const [reading, setReading] = useState<Reading | null>(null)

  const open = useCallback(
    (letter: Letter) => {
      setReading({ letter, breakSeal: !opened.has(letter.id) })
      setOpened((cur) => markOpened(cur, letter.id))
    },
    [opened],
  )
  const close = useCallback(() => setReading(null), [])

  const dialog = createPortal(
    <AnimatePresence>
      {reading && (
        <Suspense key={reading.letter.id} fallback={null}>
          <LetterDialog letter={reading.letter} breakSeal={reading.breakSeal} style={sealStyle(accent)} onClose={close} />
        </Suspense>
      )}
    </AnimatePresence>,
    document.body,
  )

  return { opened, open, dialog }
}
