import { useId } from 'react'
import { m, type Transition } from 'motion/react'
import type { OpenWorldDetail } from '../types'
import { WaxSeal } from './WaxSeal'
import styles from './Envelope.module.scss'

const EASE = [0.16, 1, 0.3, 1] as const
/** The seal splits along its crack first, then the halves drop away. */
const CRACK: Transition = { duration: 1.05, times: [0, 0.22, 1], ease: ['easeOut', [0.5, 0, 0.75, 0]] }

interface Props {
  world: OpenWorldDetail
  /** Seal broken: the opening choreography runs (and stays in its end state). */
  open: boolean
  /** Undefined when the envelope cannot be opened (no photos). */
  onBreak?: () => void
  reduced: boolean
}

/**
 * Layered envelope: inside paper, the letter card, the front pocket, the flap and the wax seal. Opening is one
 * choreography keyed on `open`: the seal cracks and falls, the flap folds back, the letter rises.
 */
export function EnvelopeArt({ world, open, onBreak, reduced }: Props) {
  const id = useId()
  const paper = `${id}-paper`
  const paperDeep = `${id}-deep`
  const flapFill = `${id}-flap`
  const t = (delay: number, duration: number) => (reduced ? { duration: 0 } : { delay, duration, ease: EASE })
  const script = world.tagline ?? world.title

  return (
    <div className={styles.scene} data-open={open || undefined}>
      <div className={styles.envelope}>
        <span className={styles.inside} aria-hidden="true" />

        <m.div
          className={styles.letter}
          initial={false}
          animate={{ y: open ? '-64%' : '0%' }}
          transition={t(1.05, 1.0)}
          aria-hidden={!open}
        >
          <span className={styles.letterEyebrow}>For you, always</span>
          <p className={styles.script}>{script}</p>
          {world.subtitle && <p className={styles.letterSub}>{world.subtitle}</p>}
          <svg className={styles.letterHeart} viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 21C6 16.5 2.5 13.2 2.5 8.9 2.5 6 4.8 3.8 7.6 3.8c1.8 0 3.4.9 4.4 2.4 1-1.5 2.6-2.4 4.4-2.4 2.8 0 5.1 2.2 5.1 5.1 0 4.3-3.5 7.6-9.5 12.1z" />
          </svg>
        </m.div>

        <svg className={styles.pocket} viewBox="0 0 100 70" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={paper} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fffaf1" />
              <stop offset="1" stopColor="#f3e3c6" />
            </linearGradient>
            <linearGradient id={paperDeep} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="#efdcb9" />
              <stop offset="1" stopColor="#fbf2e2" />
            </linearGradient>
          </defs>
          <path d="M0 0L47 38L0 70Z" fill={`url(#${paper})`} />
          <path d="M100 0L53 38L100 70Z" fill={`url(#${paper})`} />
          <path d="M0 70L50 33L100 70Z" fill={`url(#${paperDeep})`} />
          <path d="M0 70L50 33L100 70M0 0L47 38M100 0L53 38" fill="none" stroke="#c9a227" strokeOpacity="0.35" strokeWidth="0.35" />
        </svg>

        <m.span
          className={styles.flap}
          initial={false}
          animate={{ rotateX: open ? 180 : 0, zIndex: open ? 1 : 4 }}
          transition={{ rotateX: t(0.55, 0.85), zIndex: { delay: reduced ? 0 : 0.95, duration: 0 } }}
          aria-hidden="true"
        >
          <svg viewBox="0 0 100 42" preserveAspectRatio="none">
            <defs>
              <linearGradient id={flapFill} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#f6e7cb" />
                <stop offset="1" stopColor="#fff8ec" />
              </linearGradient>
            </defs>
            <path d="M0 0L50 42L100 0Z" fill={`url(#${flapFill})`} />
            <path d="M0 0L50 42L100 0" fill="none" stroke="#c9a227" strokeOpacity="0.45" strokeWidth="0.45" />
          </svg>
        </m.span>

        <span className={styles.seal} aria-hidden="true">
          <m.span
            className={styles.sealHalf}
            data-half="left"
            initial={false}
            animate={open ? { x: [0, -5, -22], y: [0, 1, 170], rotate: [0, -7, -40], opacity: [1, 1, 0] } : { x: 0, y: 0, rotate: 0, opacity: 1 }}
            transition={reduced ? { duration: 0 } : CRACK}
          >
            <WaxSeal />
          </m.span>
          <m.span
            className={styles.sealHalf}
            data-half="right"
            initial={false}
            animate={open ? { x: [0, 5, 24], y: [0, 2, 155], rotate: [0, 8, 46], opacity: [1, 1, 0] } : { x: 0, y: 0, rotate: 0, opacity: 1 }}
            transition={reduced ? { duration: 0 } : { ...CRACK, delay: 0.05 }}
          >
            <WaxSeal />
          </m.span>
        </span>

        {!open && onBreak && (
          <button type="button" className={styles.sealButton} onClick={onBreak} aria-label="Break the seal and open the letter">
            <span className={styles.sealHalo} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}
