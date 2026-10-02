import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { m } from 'motion/react'
import { ProgressiveImage } from '../../components/ProgressiveImage/ProgressiveImage'
import { safeHex, safeLqip } from '../../services/media'
import type { Moment } from '../../types/api'
import { useCountdown } from '../launcher/useCountdown'
import { formatDay, formatRemaining } from './format'
import { kenBurns } from './kenBurns'
import type { SlideView } from './playlist'
import { captionChars, typedCount } from './timing'
import styles from './Story.module.scss'

const EASE = [0.16, 1, 0.3, 1] as const

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.9, ease: EASE, delay } },
})

type TitleView = Extract<SlideView, { kind: 'title' }>
type LockedView = Extract<SlideView, { kind: 'locked' }>

/** Chapter opener: title, subtitle and tagline in shimmering gold over a soft wash of the world's accent. */
export function TitleCard({ view }: { view: TitleView }) {
  const accent = safeHex(view.accent)
  return (
    <div className={styles.card} style={accent ? ({ '--chapter-accent': accent } as CSSProperties) : undefined}>
      <m.p className={styles.eyebrow} {...rise(0.2)}>
        Chapter {view.number}
      </m.p>
      <m.h2 className={styles.cardTitle} {...rise(0.35)}>
        {view.title}
      </m.h2>
      {view.subtitle && (
        <m.p className={styles.subtitle} {...rise(0.6)}>
          {view.subtitle}
        </m.p>
      )}
      {view.tagline && (
        <m.p className={styles.tagline} {...rise(0.85)}>
          {view.tagline}
        </m.p>
      )}
    </div>
  )
}

/** A locked world: a short pause with its countdown, then the story moves on. */
export function LockedCard({ view }: { view: LockedView }) {
  const left = useCountdown(view.unlockAt)
  const text = formatRemaining(left)
  return (
    <div className={`${styles.card} ${styles.lockedCard}`}>
      <m.p className={styles.eyebrow} {...rise(0.15)}>
        A chapter still waiting…
      </m.p>
      <m.h2 className={styles.cardTitle} {...rise(0.3)}>
        {view.title}
      </m.h2>
      <m.p className={styles.countdown} role="timer" aria-label={`Opens in ${text}`} {...rise(0.5)}>
        {text}
      </m.p>
    </div>
  )
}

export function FinalCard() {
  return (
    <div className={`${styles.card} ${styles.finalCard}`}>
      <m.p className={styles.cardTitle} {...rise(0.3)}>
        To be continued…
      </m.p>
      <m.p className={styles.forever} {...rise(1.1)}>
        forever
      </m.p>
      <m.div {...rise(1.8)}>
        <Link to="/" className={styles.goldButton}>
          Back home
        </Link>
      </m.div>
    </div>
  )
}

/** The caption types itself out; screen readers get the whole sentence at once. */
function Caption({ moment, elapsed, reduced }: { moment: Moment; elapsed: number; reduced: boolean }) {
  const chars = captionChars(moment.caption)
  const n = typedCount(chars.length, elapsed, reduced)
  const meta = [moment.place, formatDay(moment.happenedOn)].filter(Boolean).join(' · ')
  if (chars.length === 0 && !meta) return null
  return (
    <div className={styles.captionBox}>
      {meta && <p className={styles.meta}>{meta}</p>}
      {chars.length > 0 && (
        <p className={styles.caption} data-testid="caption" data-typed={n}>
          <span className={styles.srOnly}>{chars.join('')}</span>
          <span aria-hidden="true" className={styles.typed}>
            {chars.slice(0, n).join('')}
          </span>
          {n < chars.length && <span aria-hidden="true" className={styles.caret} />}
          <span aria-hidden="true" className={styles.untyped}>
            {chars.slice(n).join('')}
          </span>
        </p>
      )}
    </div>
  )
}

interface PhotoProps {
  moment: Moment
  title: string
  index: number
  duration: number
  elapsed: number
  playing: boolean
  reduced: boolean
}

/** One photo, full-screen over a blur of itself, drifting in a slow pan and zoom seeded by the moment id. */
export function PhotoSlide({ moment, title, index, duration, elapsed, playing, reduced }: PhotoProps) {
  const kb = kenBurns(moment.id)
  const lqip = safeLqip(moment.media.lqip)
  const motion = {
    '--kb-s0': kb.s0,
    '--kb-s1': kb.s1,
    '--kb-x0': `${kb.x0}%`,
    '--kb-y0': `${kb.y0}%`,
    '--kb-x1': `${kb.x1}%`,
    '--kb-y1': `${kb.y1}%`,
    '--kb-dur': `${duration + 1200}ms`,
  } as CSSProperties
  return (
    <div className={styles.photoSlide}>
      <div
        className={styles.photoBackdrop}
        style={{ backgroundImage: lqip ? `url("${lqip}")` : undefined, backgroundColor: safeHex(moment.media.dominantColor) ?? undefined }}
      />
      <div className={reduced ? styles.still : styles.kenBurns} style={motion} data-paused={playing ? undefined : ''}>
        <ProgressiveImage
          // the blurred backdrop above already is the placeholder; the frame itself stays clear around the photo
          media={{ ...moment.media, lqip: null, dominantColor: null }}
          alt={moment.caption?.trim() || `${title}, photo ${index + 1}`}
          sizes="100vw"
          priority
          fit="contain"
          className={styles.photo}
        />
      </div>
      <Caption moment={moment} elapsed={elapsed} reduced={reduced} />
    </div>
  )
}
