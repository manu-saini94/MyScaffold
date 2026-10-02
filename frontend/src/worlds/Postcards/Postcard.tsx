import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { m, useMotionValue, useTransform, type PanInfo, type TargetAndTransition } from 'motion/react'
import { ProgressiveImage } from '../../components/ProgressiveImage/ProgressiveImage'
import type { Moment } from '../../types/api'
import { Postmark, Stamp } from './Marks'
import { longDate, postmarkDate, swipeDecision, type Dir } from './stack'
import styles from './Postcards.module.scss'

const FLIP = { type: 'spring', stiffness: 160, damping: 20, mass: 0.9 } as const
const SETTLE = { type: 'spring', stiffness: 220, damping: 26 } as const

/** Exit for a card leaving the deck; `custom` is the fly direction (0 = it slides back under the deck). */
export function exitFor(reduced: boolean) {
  return (dir: number): TargetAndTransition => {
    if (reduced) return { opacity: 0, transition: { duration: 0.2 } }
    if (dir === 0) return { opacity: 0, scale: 0.9, y: 30, transition: { duration: 0.3 } }
    const distance = (typeof window === 'undefined' ? 800 : window.innerWidth * 0.75) + 260
    return { x: dir * distance, y: 40, rotate: dir * 28, opacity: 0, transition: { duration: 0.55, ease: [0.32, 0, 0.67, 0] } }
  }
}

export interface PostcardProps {
  moment: Moment
  index: number
  label: string
  /** 0 = top of the deck. */
  depth: number
  tilt: number
  flipped: boolean
  reduced: boolean
  /** The card arrives from the side (it came back with "Previous") instead of rising from below. */
  fromSide: boolean
  /** Move keyboard focus here when this card reaches the top. */
  takeFocus: boolean
  deckWidth: () => number
  onSwipe: (dir: Dir) => void
  onBack: () => void
  onFlip: () => void
  onOpen: (index: number) => void
}

/** One postcard: photo, stamp, postmark and address on the front; caption and note on the back. */
export function Postcard(props: PostcardProps) {
  const { moment, index, label, depth, tilt, flipped, reduced, fromSide, takeFocus, deckWidth, onSwipe, onBack, onFlip, onOpen } = props
  const backId = useId()
  const button = useRef<HTMLButtonElement>(null)
  const dragged = useRef(false)
  const x = useMotionValue(0)
  const lean = useTransform(x, [-320, 0, 320], reduced ? [0, 0, 0] : [-12, 0, 12])
  const top = depth === 0
  const day = longDate(moment.happenedOn)

  useEffect(() => {
    if (top && takeFocus) button.current?.focus({ preventScroll: true })
  }, [top, takeFocus])

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const dir = swipeDecision(info.offset.x, info.velocity.x, deckWidth())
    if (dir) onSwipe(dir)
  }

  const onClick = () => {
    if (dragged.current) {
      dragged.current = false
      return
    }
    onFlip()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const key = e.key
    if (key === 'o' || key === 'O') onOpen(index)
    else if (key === 'ArrowRight') onSwipe(1)
    else if (key === 'ArrowLeft') onBack()
    else return
    e.preventDefault()
  }

  const rest = { opacity: 1, scale: 1 - depth * 0.05, y: depth * 16, rotate: top ? tilt * 0.3 : tilt * (1 + depth * 0.4) }
  const initial = reduced
    ? { opacity: 0, scale: rest.scale, y: rest.y, rotate: rest.rotate }
    : fromSide
      ? { opacity: 0, x: -420, rotate: -18, scale: 1, y: 0 }
      : { opacity: 0, scale: 0.86, y: 44, rotate: tilt * 2 }

  return (
    <m.div
      className={styles.slot}
      style={{ x, zIndex: 10 - depth }}
      data-depth={depth}
      initial={initial}
      animate={{ ...rest, x: 0 }}
      exit="exit"
      variants={{ exit: exitFor(reduced) }}
      transition={reduced ? { duration: 0.25 } : SETTLE}
      drag={top ? 'x' : false}
      dragSnapToOrigin
      dragElastic={0.7}
      onPointerDownCapture={() => {
        dragged.current = false
      }}
      onDragStart={() => {
        dragged.current = true
      }}
      onDragEnd={onDragEnd}
      aria-hidden={top ? undefined : true}
    >
      <m.div className={styles.lean} style={{ rotate: lean }}>
        <button
          ref={button}
          type="button"
          className={styles.card}
          data-card=""
          tabIndex={top ? 0 : -1}
          aria-pressed={flipped}
          aria-label={`Postcard: ${label}. Turn over`}
          aria-describedby={backId}
          aria-keyshortcuts="O ArrowLeft ArrowRight"
          onClick={onClick}
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
                <ProgressiveImage
                  media={moment.media}
                  alt={label}
                  priority={depth < 2}
                  sizes="(min-width: 820px) 26rem, 88vw"
                  className={styles.img}
                />
              </span>
              <span className={styles.side} aria-hidden="true">
                <span className={styles.marks}>
                  <Postmark place={moment.place} date={postmarkDate(moment.happenedOn)} />
                  <Stamp />
                </span>
                <span className={styles.address}>
                  <span className={styles.label}>Post card</span>
                  <span className={styles.line}>For you,</span>
                  <span className={styles.line}>{moment.place ?? 'wherever we are'}</span>
                  <span className={styles.line}>with all my love</span>
                </span>
              </span>
            </span>
            <span className={styles.back} id={backId}>
              <span className={styles.message}>
                {moment.caption && <span className={styles.backCaption}>{moment.caption}</span>}
                <span className={styles.note}>{moment.note ?? (moment.caption ? 'Wish you were here. Oh wait, you were.' : 'Just us.')}</span>
                <span className={styles.sign}>x</span>
              </span>
              <span className={styles.where}>
                <Stamp />
                {moment.place && <span>{moment.place}</span>}
                {day && <span>{day}</span>}
              </span>
            </span>
          </m.span>
        </button>
      </m.div>
    </m.div>
  )
}
