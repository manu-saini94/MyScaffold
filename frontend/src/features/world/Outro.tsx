import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { m } from 'motion/react'
import { prefersReducedMotion } from '../../hooks/useReducedMotion'
import type { OpenWorldDetail } from '../../types/api'
import { LettersSlot } from './LettersSlot'
import { NextChapter } from './NextChapter'
import { useOnVisible } from './useOnVisible'
import styles from './World.module.scss'

/** End of a world: outro text, the letters slot, and the way on. Scrolls itself into view when it appears. */
export function Outro({ world }: { world: OpenWorldDetail }) {
  const ref = useRef<HTMLElement>(null)
  const [seen, setSeen] = useState(false)
  useOnVisible(ref, useCallback(() => setSeen(true), []))

  useEffect(() => {
    ref.current?.scrollIntoView?.({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  }, [])

  return (
    <m.section
      ref={ref}
      className={styles.outro}
      aria-label="End of chapter"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      <span className={styles.flourish} aria-hidden="true" />
      <p className={styles.outroText}>{world.outroText ?? 'And the story goes on…'}</p>

      <LettersSlot world={world} />

      {world.nextSlug ? (
        <NextChapter slug={world.nextSlug} active={seen} />
      ) : (
        <p className={styles.sub}>That is every chapter, for now.</p>
      )}
      <Link to="/" className={styles.cta}>
        Back to all chapters
      </Link>
    </m.section>
  )
}
