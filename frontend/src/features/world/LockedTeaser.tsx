import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { m } from 'motion/react'
import type { LockedWorldDetail } from '../../types/api'
import { useUnlockCountdown } from './useUnlockCountdown'
import styles from './World.module.scss'

/** While the server still says "locked" after the countdown ends (clock skew), ask again at this pace. */
export const RELOCK_RETRY_MS = 5000

interface LockedTeaserProps {
  world: LockedWorldDetail
  onUnlockDue: () => void
}

const UNITS = [
  ['days', 'Days'],
  ['hours', 'Hours'],
  ['minutes', 'Minutes'],
  ['seconds', 'Seconds'],
] as const

/** Teaser for a world that is not open yet: frosted title and a live countdown on the server clock. */
export function LockedTeaser({ world, onUnlockDue }: LockedTeaserProps) {
  const r = useUnlockCountdown(world.unlockAt)
  const due = useRef(onUnlockDue)
  useEffect(() => {
    due.current = onUnlockDue
  }, [onUnlockDue])

  useEffect(() => {
    if (!r.done) return
    due.current()
    const id = window.setInterval(() => due.current(), RELOCK_RETRY_MS)
    return () => window.clearInterval(id)
  }, [r.done])

  const opens = new Date(world.unlockAt)
  const label = r.done
    ? 'Opening now'
    : `Opens in ${r.days} days, ${r.hours} hours, ${r.minutes} minutes and ${r.seconds} seconds`

  return (
    <m.div
      className={styles.teaser}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
    >
      <div className={styles.frost}>
        <p className={styles.eyebrow}>A chapter still sealed</p>
        <h1 id="world-title" className={styles.teaserTitle}>
          {world.title}
        </h1>
        {world.subtitle && <p className={styles.sub}>{world.subtitle}</p>}
        <div className={styles.countdown} role="timer" aria-label={label}>
          {UNITS.map(([key, name]) => (
            <span key={key} className={styles.unit} aria-hidden="true">
              <span className={styles.digits}>{String(r[key]).padStart(2, '0')}</span>
              <span className={styles.unitName}>{name}</span>
            </span>
          ))}
        </div>
        <p className={styles.when}>
          {r.done ? 'Opening…' : `Opens ${opens.toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })}`}
        </p>
        <Link to="/" className={styles.cta}>
          Back to all chapters
        </Link>
      </div>
    </m.div>
  )
}
