import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent } from 'react'
import { m, useMotionValue, useMotionValueEvent, useScroll, useTransform } from 'motion/react'
import { ProgressiveImage } from '../../components/ProgressiveImage/ProgressiveImage'
import { useOnVisible } from '../../features/world/useOnVisible'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import type { Moment } from '../../types/api'
import type { WorldLayoutProps } from '../types'
import { dateStamp, frameAspect, frameNumber, nearestFrame, offsetForFrame, stripTravel } from './filmMath'
import { useScrollParent } from '../../features/world/scrollParent'
import styles from './FilmStrip.module.scss'

/**
 * "Our firsts": a roll of film wound sideways by vertical scroll. The section is as tall as the strip is wide; its
 * sticky stage pins the film while the shell's scroller drives translateX. Reduced motion: a plain swipeable strip.
 */
export default function FilmStrip(props: WorldLayoutProps) {
  if (props.world.moments.length === 0) return <EmptyReel onFinished={props.onFinished} />
  return <Reel {...props} />
}

function EmptyReel({ onFinished }: Pick<WorldLayoutProps, 'onFinished'>) {
  useEffect(() => onFinished(), [onFinished])
  return (
    <div className={styles.empty}>
      <span className={`${styles.film} ${styles.emptyFilm}`} aria-hidden="true" />
      <p>This roll is still waiting to be developed.</p>
    </div>
  )
}

/** Leader / tail width follows the neighbouring frame, so the first and last frames can be centred. */
const edgeStyle = (moment: Moment | undefined) =>
  ({ '--edge-ar': moment ? frameAspect(moment.media.width, moment.media.height) : 1.5 }) as CSSProperties

function Reel({ world, onFinished, onOpenPhoto }: WorldLayoutProps) {
  const { moments } = world
  const count = moments.length
  const reduced = useReducedMotion()
  const reelRef = useRef<HTMLElement>(null)
  const windowRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLOListElement>(null)
  const endRef = useRef<HTMLSpanElement>(null)

  // order matters: the scroller ref is filled in a layout effect that must run before useScroll starts
  const scroller = useScrollParent(reelRef)
  const { scrollYProgress } = useScroll({ container: scroller, target: reelRef, offset: ['start start', 'end end'] })
  const travel = useMotionValue(0)
  const x = useTransform(() => -scrollYProgress.get() * travel.get())
  const [travelPx, setTravelPx] = useState(0)
  const [active, setActive] = useState(0)
  /** Frame centres, px from the track's left edge; refreshed whenever the window or the track resizes. */
  const centers = useRef<number[]>([])

  // Two ways to finish, whichever comes first: the last frame becomes the active one, or the end of the roll is seen.
  const finished = useRef(false)
  const finish = useCallback(() => {
    if (finished.current) return
    finished.current = true
    onFinished()
  }, [onFinished])
  useOnVisible(endRef, finish)
  useEffect(() => {
    if (active === count - 1) finish()
  }, [active, count, finish])

  useLayoutEffect(() => {
    const win = windowRef.current
    const track = trackRef.current
    if (!win || !track) return
    const measure = () => {
      const next = stripTravel(track.scrollWidth, win.clientWidth)
      travel.set(next)
      setTravelPx(next)
      centers.current = [...track.querySelectorAll<HTMLElement>('[data-frame]')].map((c) => c.offsetLeft + c.offsetWidth / 2)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(win)
    ro.observe(track)
    return () => ro.disconnect()
  }, [travel])

  // the window's centre, in track coordinates, is how far the track has moved plus half the window
  useMotionValueEvent(scrollYProgress, 'change', (p) => {
    const win = windowRef.current
    if (!reduced && win) setActive(nearestFrame(centers.current, p * travel.get() + win.clientWidth / 2))
  })

  const onStripScroll = () => {
    const win = windowRef.current
    if (!reduced || !win) return
    setActive(nearestFrame(centers.current, win.scrollLeft + win.clientWidth / 2))
  }

  const goTo = (index: number) => {
    const i = Math.min(count - 1, Math.max(0, index))
    const win = windowRef.current
    const cell = trackRef.current?.querySelector<HTMLElement>(`[data-frame="${i}"]`)
    if (!win || !cell) return
    const center = cell.offsetLeft + cell.offsetWidth / 2
    if (reduced) {
      // the arrows select at once; the instant scroll that follows lands on the same frame
      setActive(i)
      win.scrollTo?.({ left: offsetForFrame(0, center, win.clientWidth, win.scrollWidth - win.clientWidth) })
      return
    }
    const sc = scroller.current
    const reel = reelRef.current
    if (!sc || !reel) return
    const base = sc === document.scrollingElement ? 0 : sc.getBoundingClientRect().top
    const start = reel.getBoundingClientRect().top - base + sc.scrollTop
    sc.scrollTo?.({ top: offsetForFrame(start, center, win.clientWidth, travel.get()), behavior: 'smooth' })
  }

  // keyboard focus winds the film to that frame (a pointer click must not, it opens the photo)
  const onFrameFocus = (i: number) => (e: FocusEvent<HTMLButtonElement>) => {
    if (e.currentTarget.matches(':focus-visible')) goTo(i)
  }

  const reelStyle = reduced ? undefined : ({ height: `calc(100dvh + ${travelPx}px)` } as CSSProperties)

  return (
    <section ref={reelRef} className={styles.reel} style={reelStyle} data-reduced={reduced || undefined} aria-label="Film strip">
      <div className={styles.stage}>
        <div ref={windowRef} className={styles.window} onScroll={onStripScroll}>
          <m.ol ref={trackRef} className={styles.track} style={reduced ? undefined : { x }}>
            <li className={`${styles.film} ${styles.leader}`} style={edgeStyle(moments[0])} aria-hidden="true">
              <span className={styles.leaderText}>{world.title}</span>
              <span className={styles.edgeLeft}>▸ START</span>
            </li>
            {moments.map((moment, i) => {
              const label = moment.caption ?? `Photo ${i + 1} of ${count}`
              const stamp = dateStamp(moment.happenedOn ?? moment.media.takenAt)
              const ar = frameAspect(moment.media.width, moment.media.height)
              return (
                <li key={moment.id} className={styles.cell} data-frame={i} style={{ '--ar': ar } as CSSProperties}>
                  <button
                    type="button"
                    className={styles.film}
                    onClick={() => onOpenPhoto(i)}
                    onFocus={onFrameFocus(i)}
                    aria-label={`Open ${label}`}
                  >
                    {i % 2 === 0 && (
                      <span className={styles.edgeTop} aria-hidden="true">
                        OUR STORY 400
                      </span>
                    )}
                    <span className={styles.photo}>
                      <ProgressiveImage
                        media={moment.media}
                        alt={label}
                        priority={i < 3}
                        className={styles.img}
                        sizes="(min-width: 820px) 40rem, 80vw"
                      />
                      {stamp && (
                        <span className={styles.stamp} aria-hidden="true">
                          {stamp}
                        </span>
                      )}
                    </span>
                    <span className={styles.grain} aria-hidden="true" />
                    <span className={styles.edgeLeft} aria-hidden="true">
                      ▸ {frameNumber(i)}
                    </span>
                    <span className={styles.edgeRight} aria-hidden="true">
                      {frameNumber(i)}A
                    </span>
                  </button>
                  {moment.caption && <p className={styles.caption}>{moment.caption}</p>}
                </li>
              )
            })}
            <li className={`${styles.film} ${styles.tail}`} style={edgeStyle(moments[count - 1])} aria-hidden="true">
              <span ref={endRef} className={styles.end} />
              <span className={styles.edgeLeft}>END ◂</span>
            </li>
          </m.ol>
          {!reduced && <span className={styles.leak} aria-hidden="true" />}
        </div>

        <div className={styles.controls}>
          <button type="button" className={styles.arrow} onClick={() => goTo(active - 1)} disabled={active === 0} aria-label="Previous frame">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className={styles.meter}>
            <p className={styles.counter} aria-live="polite">
              <span className={styles.srOnly}>Frame </span>
              <strong>{frameNumber(active)}</strong>
              <span aria-hidden="true"> / </span>
              <span className={styles.srOnly}> of </span>
              {frameNumber(count - 1)}
            </p>
            {!reduced && (
              <span className={styles.line} aria-hidden="true">
                <m.span className={styles.lineFill} style={{ scaleX: scrollYProgress }} />
              </span>
            )}
          </div>
          <button
            type="button"
            className={styles.arrow}
            onClick={() => goTo(active + 1)}
            disabled={active >= count - 1}
            aria-label="Next frame"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <p className={styles.hint} aria-hidden="true">
          {reduced ? 'Swipe the strip or use the arrows' : 'Scroll to wind the film'}
        </p>
      </div>
    </section>
  )
}
