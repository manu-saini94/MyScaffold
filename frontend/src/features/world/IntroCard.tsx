import { useEffect, useRef } from 'react'
import { m } from 'motion/react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import type { OpenWorldDetail } from '../../types/api'
import styles from './World.module.scss'

/** A title-only card moves on by itself after at least this long... */
export const INTRO_MIN_MS = 2400
/** ...plus this much per character of title, subtitle and tagline... */
export const INTRO_MS_PER_CHAR = 60
/** ...capped here. */
export const INTRO_MAX_MS = 6000

const EASE = [0.16, 1, 0.3, 1] as const

type IntroText = Pick<OpenWorldDetail, 'title' | 'subtitle' | 'tagline' | 'introText'>

/**
 * How long the card waits before moving on by itself, or null to wait for the visitor. Intro text is reading
 * material (it can run to 2000 characters), so a card with it never times out (WCAG 2.2.1), nor does any card under
 * reduced motion. A short card scales with the text it shows.
 */
export function introAutoAdvanceMs(world: IntroText, reduced: boolean): number | null {
  if (reduced || world.introText?.trim()) return null
  const chars = world.title.length + (world.subtitle?.length ?? 0) + (world.tagline?.length ?? 0)
  return Math.min(INTRO_MAX_MS, INTRO_MIN_MS + chars * INTRO_MS_PER_CHAR)
}

const isControl = (t: EventTarget | null) => t instanceof Element && !!t.closest('button, a, input, textarea, select')

/** Opening title card: title, subtitle, tagline and intro text. Tap anywhere, press Enter or the button to continue. */
export function IntroCard({ world, onDone }: { world: OpenWorldDetail; onDone: () => void }) {
  const reduced = useReducedMotion()
  const autoMs = introAutoAdvanceMs(world, reduced)
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  }, [onDone])

  useEffect(() => {
    if (autoMs === null) return
    const id = window.setTimeout(() => done.current(), autoMs)
    return () => window.clearTimeout(id)
  }, [autoMs])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // a focused control answers Enter itself
      if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.altKey || isControl(e.target)) return
      e.preventDefault()
      done.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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
        {autoMs === null ? 'Continue' : 'Skip intro'}
      </m.button>
    </m.div>
  )
}
