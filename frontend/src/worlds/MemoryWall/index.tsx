import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { m, useScroll, useTransform, type MotionValue } from 'motion/react'
import { ProgressiveImage } from '../../components/ProgressiveImage/ProgressiveImage'
import { useOnVisible } from '../../features/world/useOnVisible'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import type { Moment } from '../../types/api'
import { useScrollParent } from '../../features/world/scrollParent'
import type { WorldLayoutProps } from '../types'
import { columnCount, columnDepth, decorationFor, masonry, parallaxShift } from './wallMath'
import styles from './MemoryWall.module.scss'

const EASE = [0.16, 1, 0.3, 1] as const

/**
 * "Little everyday moments": candid prints taped and pinned to a wall. Columns drift at different depths as the
 * shell's scroller moves; a print lifts and shows its handwritten caption on hover, focus or touch.
 */
export default function MemoryWall(props: WorldLayoutProps) {
  if (props.world.moments.length === 0) return <EmptyWall onFinished={props.onFinished} />
  return <Wall {...props} />
}

function EmptyWall({ onFinished }: Pick<WorldLayoutProps, 'onFinished'>) {
  useEffect(() => onFinished(), [onFinished])
  return (
    <div className={styles.empty}>
      <span className={styles.emptyNote} data-pattern="2" aria-hidden="true">
        <span className={styles.tape} />
      </span>
      <p>Nothing pinned up here yet.</p>
    </div>
  )
}

/** Width of `ref` (px), tracked with a ResizeObserver; starts from the window width to avoid a relayout. */
function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 1024 : window.innerWidth))
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => {
      if (el.clientWidth > 0) setWidth(el.clientWidth)
    }
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}

const aspectOf = ({ media }: Moment) => (media.width && media.height ? media.width / media.height : 1)

function Wall({ world, onFinished, onOpenPhoto }: WorldLayoutProps) {
  const { moments } = world
  const reduced = useReducedMotion()
  const wallRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  // order matters: the scroller ref is filled in a layout effect that must run before useScroll starts
  const scroller = useScrollParent(wallRef)
  const { scrollYProgress } = useScroll({ container: scroller, target: wallRef, offset: ['start end', 'end start'] })
  const width = useWidth(wallRef)
  const cols = columnCount(width, moments.length)
  const columns = useMemo(() => masonry(moments.map(aspectOf), cols), [moments, cols])
  const amplitude = width < 560 ? 14 : 30

  useOnVisible(endRef, onFinished)

  return (
    <div ref={wallRef} className={styles.wall}>
      <div className={styles.columns} role="list" aria-label="Photos" style={{ '--cols': columns.length } as CSSProperties}>
        {columns.map((indices, c) => (
          <WallColumn key={c} depth={columnDepth(c)} amplitude={amplitude} progress={scrollYProgress} still={reduced}>
            {indices.map((i) => {
              const moment = moments[i]
              return (
                moment && (
                  <Print
                    key={moment.id}
                    moment={moment}
                    index={i}
                    count={moments.length}
                    column={c}
                    reduced={reduced}
                    onOpen={onOpenPhoto}
                  />
                )
              )
            })}
          </WallColumn>
        ))}
      </div>
      <div ref={endRef} className={styles.end} aria-hidden="true" />
    </div>
  )
}

interface WallColumnProps {
  depth: number
  amplitude: number
  progress: MotionValue<number>
  still: boolean
  children: ReactNode
}

function WallColumn({ depth, amplitude, progress, still, children }: WallColumnProps) {
  const y = useTransform(progress, (p) => parallaxShift(depth, p, amplitude))
  return (
    <m.div role="none" className={styles.column} style={still || depth === 0 ? undefined : { y }}>
      {children}
    </m.div>
  )
}

interface PrintProps {
  moment: Moment
  index: number
  count: number
  column: number
  reduced: boolean
  onOpen: (index: number) => void
}

function Print({ moment, index, count, column, reduced, onOpen }: PrintProps) {
  const deco = decorationFor(moment.id)
  const label = moment.caption ?? `Photo ${index + 1} of ${count}`
  const style = {
    '--tilt': `${deco.tilt}deg`,
    '--tape-angle': `${deco.tapeAngle}deg`,
    '--tape-shift': `${deco.tapeShift}%`,
    '--print-w': `${deco.width}%`,
    '--print-x': deco.offset,
  } as CSSProperties

  return (
    <m.div
      role="listitem"
      className={styles.item}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 36, scale: 0.96 }}
      whileInView={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: '0px 0px -6% 0px' }}
      transition={{ duration: reduced ? 0.4 : 0.75, ease: EASE, delay: column * 0.09 }}
    >
      <button
        type="button"
        className={styles.card}
        style={style}
        data-pattern={deco.pattern}
        onClick={() => onOpen(index)}
        aria-label={`Open ${label}`}
      >
        <span className={styles.lift} aria-hidden="true" />
        <span className={styles.paper}>
          <ProgressiveImage
            media={moment.media}
            alt={label}
            priority={index < 4}
            sizes="(min-width: 1100px) 18rem, (min-width: 560px) 30vw, 46vw"
          />
          {moment.caption && <span className={styles.caption}>{moment.caption}</span>}
        </span>
        {deco.fastener === 'tape' && <span className={styles.tape} aria-hidden="true" />}
        {deco.fastener === 'corners' && (
          <>
            <span className={`${styles.tape} ${styles.cornerLeft}`} aria-hidden="true" />
            <span className={`${styles.tape} ${styles.cornerRight}`} aria-hidden="true" />
          </>
        )}
        {deco.fastener === 'pin' && <span className={styles.pin} aria-hidden="true" />}
      </button>
    </m.div>
  )
}
