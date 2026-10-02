import '@fontsource/fraunces/latin-400-italic.css'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import type { Letter } from '../../types/api'
import { deckleClipPath } from './deckle'
import { LetterMarkdown } from './LetterMarkdown'
import { useModalFocus } from './useModalFocus'
import { SEAL_HALVES, WaxSeal } from './WaxSeal'
import styles from './Letters.module.scss'

/** Length of the seal-break scene before the letter itself is shown. */
export const BREAK_MS = 1700

const EASE = [0.16, 1, 0.3, 1] as const

interface LetterDialogProps {
  letter: Letter
  /** Play the seal break first (first opening, motion allowed); otherwise the letter fades straight in. */
  breakSeal: boolean
  style?: CSSProperties
  onClose: () => void
}

/** The opened letter: a modal dialog with the seal-break scene, then the letter on deckle-edged paper. */
export default function LetterDialog({ letter, breakSeal, style, onClose }: LetterDialogProps) {
  const reduced = useReducedMotion()
  const playScene = breakSeal && !reduced
  const [stage, setStage] = useState<'scene' | 'letter'>(playScene ? 'scene' : 'letter')
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const edge = useMemo(() => deckleClipPath(letter.id), [letter.id])
  useModalFocus(dialogRef, closeRef, onClose)

  useEffect(() => {
    if (stage !== 'scene') return
    const t = window.setTimeout(() => setStage('letter'), BREAK_MS)
    return () => window.clearTimeout(t)
  }, [stage])

  return (
    <m.div
      className={`${styles.sealScope} ${styles.backdrop}`}
      style={style}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
      transition={{ duration: reduced ? 0.2 : 0.35 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      data-click-effect="none"
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={letter.title} tabIndex={-1} className={styles.dialog}>
        <button ref={closeRef} type="button" className={styles.close} onClick={onClose} aria-label="Close letter">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        <AnimatePresence>
          {stage === 'scene' ? (
            <SealBreakScene key="scene" />
          ) : (
            <m.article
              key="letter"
              className={styles.paperWrap}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: reduced ? 0.3 : 0.7, ease: EASE }}
            >
              <div className={styles.paper} style={{ clipPath: edge }}>
                <WaxSeal className={styles.paperSeal} />
                <h2 className={styles.letterTitle}>{letter.title}</h2>
                <div className={styles.letterBody}>
                  <LetterMarkdown body={letter.body} />
                </div>
              </div>
            </m.article>
          )}
        </AnimatePresence>
      </div>
    </m.div>
  )
}

/** Seal splits along its crack and falls away, the flap opens, the paper slides up out of the envelope. */
function SealBreakScene() {
  return (
    <m.div className={styles.scene} aria-hidden="true" exit={{ opacity: 0, y: 40, transition: { duration: 0.45, ease: EASE } }}>
      <div className={styles.sceneEnvelope}>
        <div className={styles.sceneBack} />
        <m.div
          className={styles.sceneSheet}
          initial={{ y: '0%' }}
          animate={{ y: '-62%' }}
          transition={{ delay: 0.95, duration: 0.65, ease: EASE }}
        />
        <div className={styles.scenePocket} />
        <m.div
          className={styles.sceneFlap}
          initial={{ scaleY: 1, zIndex: 4 }}
          animate={{ scaleY: -1, zIndex: 1 }}
          transition={{ scaleY: { delay: 0.45, duration: 0.5, ease: [0.65, 0, 0.35, 1] }, zIndex: { delay: 0.72, duration: 0 } }}
        />
        <m.div
          className={styles.sceneSeal}
          initial={{ scale: 1 }}
          animate={{ scale: [1, 1.12, 1] }}
          transition={{ duration: 0.22 }}
        >
          {(['left', 'right'] as const).map((side) => (
            <m.span
              key={side}
              className={styles.sealHalf}
              style={{ clipPath: SEAL_HALVES[side] }}
              initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
              animate={{ x: side === 'left' ? -16 : 16, y: 34, rotate: side === 'left' ? -24 : 22, opacity: 0 }}
              transition={{ delay: 0.22, duration: 0.55, ease: [0.5, 0, 0.75, 0] }}
            >
              <WaxSeal />
            </m.span>
          ))}
        </m.div>
      </div>
    </m.div>
  )
}
