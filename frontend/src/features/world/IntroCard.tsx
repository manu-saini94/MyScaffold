import { useEffect, useRef } from 'react'
import { m } from 'motion/react'
import type { OpenWorldDetail } from '../../types/api'
import styles from './World.module.scss'

/** The title card moves on by itself after this long. */
export const INTRO_MS = 2400

const EASE = [0.16, 1, 0.3, 1] as const

/** Opening title card: title, subtitle, tagline and intro text. Tap anywhere, press Skip, or wait to continue. */
export function IntroCard({ world, onDone }: { world: OpenWorldDetail; onDone: () => void }) {
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  }, [onDone])

  useEffect(() => {
    const id = window.setTimeout(() => done.current(), INTRO_MS)
    return () => window.clearTimeout(id)
  }, [])

  const rise = (delay: number) => ({
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE, delay } },
  })

  return (
    <m.div className={styles.intro} onClick={onDone} exit={{ opacity: 0, transition: { duration: 0.35 } }}>
      {world.subtitle && (
        <m.p className={styles.eyebrow} {...rise(0.25)}>
          {world.subtitle}
        </m.p>
      )}
      <m.h1 id="world-title" className={styles.introTitle} {...rise(0.35)}>
        {world.title}
      </m.h1>
      {world.tagline && (
        <m.p className={styles.tagline} {...rise(0.55)}>
          {world.tagline}
        </m.p>
      )}
      {world.introText && (
        <m.p className={styles.introText} {...rise(0.7)}>
          {world.introText}
        </m.p>
      )}
      <m.button
        type="button"
        className={styles.skip}
        onClick={(e) => {
          e.stopPropagation()
          onDone()
        }}
        {...rise(0.9)}
      >
        Skip intro
      </m.button>
    </m.div>
  )
}
