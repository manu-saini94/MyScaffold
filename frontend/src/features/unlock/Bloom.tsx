import { m } from 'motion/react'
import { Rose } from '../../components/Rose/Rose'
import styles from './UnlockScreen.module.scss'

export const BLOOM_MS = 950
const EASE = [0.16, 1, 0.3, 1] as const

/** Success overlay: a radial reveal with a rose opening in the middle. Reduced motion: a plain fade. */
export function Bloom({ reduced }: { reduced: boolean }) {
  const duration = BLOOM_MS / 1000
  const reveal = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : {
        initial: { clipPath: 'circle(0% at 50% 50%)' },
        animate: { clipPath: 'circle(75% at 50% 50%)' },
      }

  return (
    <m.div className={styles.bloom} {...reveal} transition={{ duration, ease: EASE }} data-testid="bloom">
      <m.span
        className={styles.bloomRose}
        initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.4, rotate: -25 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, rotate: 0 }}
        transition={{ duration: duration * 0.85, ease: EASE, delay: duration * 0.1 }}
      >
        <Rose variant="bloom" size="100%" />
      </m.span>
    </m.div>
  )
}
