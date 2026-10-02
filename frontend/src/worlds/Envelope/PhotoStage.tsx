import { useEffect, useRef } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { ProgressiveImage } from '../../components/ProgressiveImage/ProgressiveImage'
import type { Moment } from '../../types/api'
import { heartBurst } from './heartBurst'
import styles from './Envelope.module.scss'

const EASE = [0.16, 1, 0.3, 1] as const

interface Props {
  moments: Moment[]
  /** Index of the photo on show. */
  current: number
  keyIndex: number
  reduced: boolean
  onOpen: (index: number) => void
}

const label = (mo: Moment, i: number, n: number) => mo.caption ?? `Photo ${i + 1} of ${n}`

/** The photo that just unfolded out of the envelope; the key photo celebrates with a heart burst. */
export function PhotoStage({ moments, current, keyIndex, reduced, onOpen }: Props) {
  const cardRef = useRef<HTMLButtonElement>(null)
  const moment = moments[current]
  const isKey = current === keyIndex

  useEffect(() => {
    if (!isKey) return
    const timer = window.setTimeout(
      () => {
        const r = cardRef.current?.getBoundingClientRect()
        if (!r || !window.innerWidth || !window.innerHeight) return
        void heartBurst({ x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height * 0.45) / window.innerHeight })
      },
      reduced ? 0 : 520,
    )
    return () => window.clearTimeout(timer)
  }, [isKey, current, reduced])

  if (!moment) return null
  const n = moments.length

  return (
    <figure className={styles.stage}>
      <AnimatePresence mode="wait" initial={!reduced}>
        <m.button
          key={moment.id}
          ref={cardRef}
          type="button"
          className={styles.card}
          data-key={isKey || undefined}
          onClick={() => onOpen(current)}
          aria-label={`Open ${label(moment, current, n)}`}
          style={{ transformPerspective: 900, originY: 0 }}
          initial={reduced ? { opacity: 0 } : { opacity: 0, rotateX: -78, y: -36, scale: 0.92 }}
          animate={{ opacity: 1, rotateX: 0, y: 0, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.96 }}
          transition={{ duration: reduced ? 0.2 : 0.75, ease: EASE }}
        >
          <ProgressiveImage
            className={styles.cardImg}
            media={moment.media}
            alt={label(moment, current, n)}
            priority
            sizes="(min-width: 560px) 22rem, 80vw"
          />
          {isKey && (
            <span className={styles.badge} aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 21C6 16.5 2.5 13.2 2.5 8.9 2.5 6 4.8 3.8 7.6 3.8c1.8 0 3.4.9 4.4 2.4 1-1.5 2.6-2.4 4.4-2.4 2.8 0 5.1 2.2 5.1 5.1 0 4.3-3.5 7.6-9.5 12.1z" />
              </svg>
            </span>
          )}
        </m.button>
      </AnimatePresence>
      <figcaption className={styles.caption} aria-live="polite">
        {moment.caption ?? ' '}
      </figcaption>
    </figure>
  )
}
