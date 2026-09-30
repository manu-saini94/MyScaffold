import { AnimatePresence, m } from 'motion/react'
import type { World } from '../../types/world'
import { useCountdown } from './useCountdown'
import styles from './WorldLabel.module.scss'

const pad = (n: number) => String(n).padStart(2, '0')

function formatUnlock(iso: string | null): string {
  if (!iso) return 'a day still to come'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function Countdown({ unlockAt }: { unlockAt: string | null }) {
  const r = useCountdown(unlockAt)
  const parts: Array<[string, number]> = [
    ['days', r.days],
    ['hrs', r.hours],
    ['min', r.minutes],
    ['sec', r.seconds],
  ]
  return (
    <div className={styles.countdown} role="timer" aria-label={`Opens in ${r.days} days, ${r.hours} hours`}>
      {parts.map(([label, v]) => (
        <span key={label} className={styles.unit}>
          <strong>{label === 'days' ? v : pad(v)}</strong>
          <small>{label}</small>
        </span>
      ))}
    </div>
  )
}

interface WorldLabelProps {
  world: World | undefined
  index: number
  total: number
  peeking: boolean
}

/** Title of the centre-most world, or a live countdown while a locked world is focused / tapped. */
export function WorldLabel({ world, index, total, peeking }: WorldLabelProps) {
  if (!world) return <div className={styles.label} />
  const showCountdown = peeking && world.locked
  return (
    <div className={styles.label} aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={`${world.id}-${showCountdown}`}
          className={styles.inner}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className={styles.eyebrow}>
            Chapter {pad(index + 1)} <span aria-hidden="true">/</span> {pad(total)}
          </p>
          <h2 className={styles.title}>{world.title}</h2>
          {showCountdown ? (
            <>
              <p className={styles.sub}>Opens on {formatUnlock(world.unlockAt)}</p>
              <Countdown unlockAt={world.unlockAt} />
            </>
          ) : (
            <p className={styles.sub}>{world.locked ? 'Locked. Tap to peek at the countdown.' : world.subtitle}</p>
          )}
        </m.div>
      </AnimatePresence>
    </div>
  )
}
