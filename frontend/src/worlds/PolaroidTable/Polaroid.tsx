import { useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { m } from 'motion/react'
import { ProgressiveImage } from '../../components/ProgressiveImage/ProgressiveImage'
import type { Moment } from '../../types/api'
import { formatDay, type CardSpot } from './table'
import styles from './PolaroidTable.module.scss'

/** Two taps on the same card within this many ms open the photo. */
const DOUBLE_TAP_MS = 320
const FLIP = { type: 'spring', stiffness: 170, damping: 21, mass: 0.9 } as const

export interface PolaroidProps {
  moment: Moment
  index: number
  label: string
  spot: CardSpot
  width: number
  z: number
  flipped: boolean
  reduced: boolean
  /** Phones drag sideways only, so the page still scrolls under a finger. */
  axis: true | 'x'
  tableRef: RefObject<HTMLDivElement | null>
  onFlip: (index: number) => void
  onOpen: (index: number) => void
  onLift: (id: string) => void
}

/** One polaroid: drag it around the table, tap to turn it over, double-tap / O / the lens button to look closer. */
export function Polaroid({ moment, index, label, spot, width, z, flipped, reduced, axis, tableRef, onFlip, onOpen, onLift }: PolaroidProps) {
  const backId = useId()
  const dragged = useRef(false)
  const lastTap = useRef(0)
  const [dragging, setDragging] = useState(false)
  const day = formatDay(moment.happenedOn)
  const meta = [moment.place, day].filter(Boolean).join(' · ')

  const tap = () => {
    if (dragged.current) {
      dragged.current = false
      return
    }
    const now = Date.now()
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0
      onFlip(index) // undo the first tap's turn, so a double-tap leaves the card as it was
      onOpen(index)
      return
    }
    lastTap.current = now
    onFlip(index)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'o' || e.key === 'O') {
      e.preventDefault()
      onOpen(index)
    }
  }

  return (
    <m.div
      className={styles.card}
      data-dragging={dragging || undefined}
      style={{ left: spot.x, top: spot.y, width, zIndex: z }}
      initial={reduced ? { opacity: 0, rotate: spot.rotate } : { opacity: 0, scale: 1.18, rotate: spot.rotate * 2.2 }}
      animate={{ opacity: 1, scale: 1, rotate: spot.rotate }}
      transition={reduced ? { duration: 0.35 } : { type: 'spring', stiffness: 140, damping: 16, delay: 0.08 + index * 0.07 }}
      drag={axis}
      dragConstraints={tableRef}
      dragElastic={0.14}
      dragMomentum={!reduced}
      dragTransition={{ power: 0.28, timeConstant: 240, bounceStiffness: 260, bounceDamping: 24 }}
      whileDrag={reduced ? undefined : { scale: 1.06, rotate: spot.rotate * 0.4 }}
      onPointerDownCapture={() => {
        dragged.current = false
        onLift(moment.id)
      }}
      onDragStart={() => {
        dragged.current = true
        setDragging(true)
      }}
      onDragEnd={() => setDragging(false)}
    >
      <button
        type="button"
        className={styles.flipper}
        aria-pressed={flipped}
        aria-label={`${label}. Turn over`}
        aria-describedby={backId}
        aria-keyshortcuts="O"
        onClick={tap}
        onKeyDown={onKeyDown}
      >
        <m.span
          className={styles.inner}
          data-flat={reduced || undefined}
          data-flipped={flipped || undefined}
          initial={false}
          animate={reduced ? undefined : { rotateY: flipped ? 180 : 0 }}
          transition={FLIP}
        >
          <span className={styles.front}>
            <span className={styles.photo}>
              <ProgressiveImage media={moment.media} alt={label} priority={index < 4} sizes={`${width}px`} className={styles.img} />
            </span>
            <span className={styles.strip} aria-hidden="true">
              {moment.caption ?? meta}
            </span>
          </span>
          <span className={styles.back} id={backId}>
            {moment.caption && <span className={styles.backCaption}>{moment.caption}</span>}
            {moment.note && <span className={styles.note}>{moment.note}</span>}
            {meta && <span className={styles.meta}>{meta}</span>}
            {!moment.caption && !moment.note && !meta && <span className={styles.note}>Just us.</span>}
          </span>
        </m.span>
      </button>
      <button type="button" className={styles.zoom} onClick={() => onOpen(index)} aria-label={`Open ${label}`}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M15 15l5 5M10.5 8v5M8 10.5h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </m.div>
  )
}
