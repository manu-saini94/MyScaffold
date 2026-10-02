import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import type { World } from '../../types/world'
import { preloadWorld } from '../world/preload'
import { nearestInDirection, scatterOrbs, type Direction } from './scatter'
import { isWorldLocked } from './useWorlds'
import { useProgress } from './useProgress'
import { WorldOrb } from './WorldOrb'
import styles from './OrbField.module.scss'

interface OrbFieldProps {
  worlds: readonly World[]
  /** False while a world overlay is open: the field goes inert and restores focus afterwards. */
  active: boolean
  onOpen: (world: World) => void
}

const ARROWS: Record<string, Direction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
}

/** Inset kept clear around the scatter: room for the hover lift, the progress ring and the title card under an orb. */
const PAD_X = 18
const PAD_TOP = 14
const PAD_BOTTOM = 84

/** Title cards are about 17rem wide: within ~140px of an edge they hang from the orb's outer side. */
function labelAlign(x: number, width: number): 'start' | 'center' | 'end' {
  if (x < 140) return 'start'
  if (x > width - 140) return 'end'
  return 'center'
}

/** Scattered round worlds over the free area below the hero. Deterministic per world set and field size. */
export function OrbField({ worlds, active, onOpen }: OrbFieldProps) {
  const fieldRef = useRef<HTMLDivElement>(null)
  const lastFocused = useRef<HTMLButtonElement | null>(null)
  const [size, setSize] = useState({ w: 390, h: 560 })
  const progress = useProgress()

  useLayoutEffect(() => {
    const el = fieldRef.current
    if (!el) return
    const measure = () => {
      // jsdom (and a not-yet-laid-out field) reports 0: keep the last real size
      if (el.clientWidth > 0 && el.clientHeight > 0) setSize({ w: el.clientWidth, h: el.clientHeight })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const keys = useMemo(() => worlds.map((w) => w.slug), [worlds])
  const scatter = useMemo(
    () => scatterOrbs(keys, Math.max(0, size.w - PAD_X * 2), Math.max(0, size.h - PAD_TOP - PAD_BOTTOM)),
    [keys, size.w, size.h],
  )

  // warm the lazy world chunk when the browser is idle so the first expand never waits on the network
  useEffect(() => {
    const id = window.setTimeout(() => void preloadWorld(), 1200)
    return () => window.clearTimeout(id)
  }, [])

  // restore focus to the orb that opened a world once the overlay closes
  useEffect(() => {
    if (active) lastFocused.current?.focus({ preventScroll: true })
  }, [active])

  const focusOrb = (i: number) => fieldRef.current?.querySelector<HTMLButtonElement>(`[data-orb="${i}"]`)?.focus()

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = Number((e.target as HTMLElement).dataset.orb)
    if (!Number.isInteger(current)) return
    const dir = ARROWS[e.key]
    if (!dir && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const next = dir ? nearestInDirection(scatter.orbs, current, dir) : e.key === 'Home' ? 0 : scatter.orbs.length - 1
    if (next !== null) focusOrb(next)
  }

  const innerStyle = { height: scatter.height + PAD_BOTTOM, '--pad-x': `${PAD_X}px`, '--pad-top': `${PAD_TOP}px` } as CSSProperties

  return (
    <div
      ref={fieldRef}
      className={styles.field}
      // scroll only when the orbs need more room: a scroll container would clip the shared-element transition
      data-scroll={scatter.height + PAD_BOTTOM + PAD_TOP > size.h || undefined}
      role="group"
      aria-label="Chapters of our story. Arrow keys move between them, Enter opens one."
      onKeyDown={onKeyDown}
      onFocus={(e) => {
        if (e.target instanceof HTMLButtonElement) lastFocused.current = e.target
      }}
      inert={!active}
    >
      <div className={styles.inner} style={innerStyle}>
        {scatter.orbs.map((orb, i) => {
          const world = worlds[i]!
          return (
            <WorldOrb
              key={world.slug}
              world={world}
              orb={orb}
              index={i}
              locked={isWorldLocked(world)}
              shared={active}
              align={labelAlign(orb.x, size.w - PAD_X * 2)}
              progress={progress[world.slug] ?? 0}
              onOpen={onOpen}
              onHover={() => void preloadWorld()}
            />
          )
        })}
      </div>
    </div>
  )
}
