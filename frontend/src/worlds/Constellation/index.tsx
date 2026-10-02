import '@fontsource/fraunces/latin-400-italic.css'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { ProgressiveImage } from '../../components/ProgressiveImage/ProgressiveImage'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import type { WorldLayoutProps } from '../types'
import { arcPath, discover, HEART_ASPECT, heartPath, heartStars, isComplete, nextHint, segments } from './heart'
import { Sky } from './Sky'
import styles from './Constellation.module.scss'

const EASE = [0.16, 1, 0.3, 1] as const
const VB_W = 1000
const VB_H = Math.round(VB_W / HEART_ASPECT)
export const FINAL_LINE = 'Every star led me to you'
/** How long the completed heart glows before the shell's outro takes over. */
export const FINISH_MS = 2400

/** "Our forever": a night sky where every moment is a star on a heart; finding them all draws the heart in gold. */
export default function Constellation({ world, onFinished, onOpenPhoto }: WorldLayoutProps) {
  const { moments } = world
  const n = moments.length
  const reduced = useReducedMotion()
  const stars = useMemo(() => heartStars(n), [n])
  const [found, setFound] = useState<readonly boolean[]>(() => moments.map(() => false))
  const [active, setActive] = useState<number | null>(null)
  const complete = isComplete(found)
  const hint = nextHint(found, active)
  const lines = segments(found)
  const finishedRef = useRef(false)

  useEffect(() => {
    if (n === 0) {
      onFinished()
      return
    }
    if (!complete || finishedRef.current) return
    const timer = window.setTimeout(() => {
      finishedRef.current = true
      onFinished()
    }, reduced ? 400 : FINISH_MS)
    return () => window.clearTimeout(timer)
  }, [n, complete, reduced, onFinished])

  const tapStar = (i: number) => {
    setFound((f) => discover(f, i))
    setActive(i)
  }

  if (n === 0) {
    return (
      <section className={styles.sky} aria-label="Night sky">
        <Sky />
        <p className={styles.empty}>The sky is still waiting for its stars.</p>
      </section>
    )
  }

  const foundCount = found.filter(Boolean).length
  const current = active === null ? null : moments[active]
  const heartStyle = { '--aspect': HEART_ASPECT } as CSSProperties

  return (
    <section className={styles.sky} aria-label="Night sky" data-click-effect="none" data-complete={complete || undefined}>
      <Sky />
      <p className={styles.lead}>{foundCount === 0 ? 'Touch a star to find a memory' : `${foundCount} of ${n} stars found`}</p>
      <p className={styles.srOnly} aria-live="polite">
        {foundCount > 0 && `${foundCount} of ${n} stars found${complete ? `. ${FINAL_LINE}.` : ''}`}
      </p>

      <div className={styles.heart} style={heartStyle}>
        <svg className={styles.lines} viewBox={`0 0 ${VB_W} ${VB_H}`} aria-hidden="true">
          <path className={styles.guide} d={heartPath(VB_W, VB_H)} />
          {lines.map(([i, j]) => (
            <m.path
              key={`${i}-${j}`}
              className={styles.line}
              d={arcPath(stars[i]?.s ?? 0, stars[j]?.s ?? 0, VB_W, VB_H)}
              initial={reduced ? false : { pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.1, ease: EASE }}
            />
          ))}
          {complete && (
            <m.path
              className={styles.glow}
              d={heartPath(VB_W, VB_H)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: reduced ? 0 : 1.4, delay: reduced ? 0 : 0.8 }}
            />
          )}
        </svg>

        <ol className={styles.stars}>
          {moments.map((mo, i) => {
            const p = stars[i] ?? { x: 0.5, y: 0.5 }
            return (
              <li key={mo.id} style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}>
                <button
                  type="button"
                  className={styles.star}
                  data-found={found[i] || undefined}
                  data-hint={(i === hint && !found[i]) || undefined}
                  data-active={i === active || undefined}
                  onClick={() => tapStar(i)}
                  aria-label={`Star ${i + 1} of ${n}${found[i] && mo.caption ? `: ${mo.caption}` : ''}${found[i] ? ' (found)' : ''}`}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 1.5c.6 5.6 4.9 9.9 10.5 10.5-5.6.6-9.9 4.9-10.5 10.5C11.4 16.9 7.1 12.6 1.5 12 7.1 11.4 11.4 7.1 12 1.5z" />
                  </svg>
                </button>
              </li>
            )
          })}
        </ol>

        <AnimatePresence mode="wait" initial={false}>
          {current && active !== null && (
            <m.figure
              key={current.id}
              className={styles.card}
              initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.7, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
              transition={{ duration: reduced ? 0.2 : 0.55, ease: EASE }}
            >
              <button
                type="button"
                className={styles.photo}
                onClick={() => onOpenPhoto(active)}
                aria-label={`Open ${current.caption ?? `photo ${active + 1} of ${n}`}`}
              >
                <ProgressiveImage
                  className={styles.photoImg}
                  media={current.media}
                  alt={current.caption ?? `Photo ${active + 1} of ${n}`}
                  priority
                  sizes="(min-width: 820px) 16rem, 40vw"
                />
              </button>
              {current.caption && <figcaption className={styles.caption}>{current.caption}</figcaption>}
            </m.figure>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {complete && (
          <m.p
            className={styles.finale}
            initial={{ opacity: 0, y: reduced ? 0 : 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduced ? 0.2 : 1, delay: reduced ? 0 : 1.1, ease: EASE }}
          >
            {FINAL_LINE}
          </m.p>
        )}
      </AnimatePresence>
    </section>
  )
}
