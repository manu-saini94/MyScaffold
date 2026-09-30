import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { GhostIcon, WorldIcon } from '../../components/WorldIcon/WorldIcon'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import type { World } from '../../types/world'
import { FieldEngine } from './fieldEngine'
import { buildCells, neighbourInDirection, type Cell, type Direction } from './hexLayout'
import { isWorldLocked } from './useWorlds'
import { preloadWorld } from '../world/preload'
import styles from './HoneycombField.module.scss'

interface HoneycombFieldProps {
  worlds: readonly World[]
  /** False while a world overlay is open: the field goes inert and restores focus afterwards. */
  active: boolean
  onCenterChange: (worldIndex: number) => void
  onOpen: (world: World) => void
  onPeekLocked: (world: World | null) => void
}

const ARROWS: Record<string, Direction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
}

function ringsFor(width: number): number {
  return width < 560 ? 2 : width < 1024 ? 3 : 4
}

function LauncherCell({
  cell,
  engine,
  children,
  dim,
}: {
  cell: Cell
  engine: FieldEngine
  children: React.ReactNode
  dim: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    engine.register(cell.index, ref.current)
    return () => engine.register(cell.index, null)
  }, [engine, cell.index])
  return (
    <div ref={ref} className={`${styles.cell} ${dim ? styles.ghostCell : ''}`}>
      {children}
    </div>
  )
}

export function HoneycombField({ worlds, active, onCenterChange, onOpen, onPeekLocked }: HoneycombFieldProps) {
  const reduced = useReducedMotion()
  const fieldRef = useRef<HTMLDivElement>(null)
  const lastFocused = useRef<HTMLButtonElement | null>(null)
  const [size, setSize] = useState({ w: 390, h: 640 })
  const [activeCell, setActiveCell] = useState(0)

  const [engine] = useState(
    () =>
      new FieldEngine({
        reducedMotion: false,
        onCenterChange: (i) => setActiveCell(i),
      }),
  )

  useEffect(() => engine.setOptions(reduced), [engine, reduced])
  useEffect(() => () => engine.destroy(), [engine])

  // measure the field
  useLayoutEffect(() => {
    const el = fieldRef.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const minDim = Math.min(size.w, size.h)
  const pitch = Math.min(150, Math.max(86, minDim * 0.27))
  const cellSize = pitch * 0.8
  const rings = ringsFor(size.w)
  const cells = useMemo(() => buildCells(rings, pitch), [rings, pitch])
  const worldCells = useMemo(() => cells.slice(0, worlds.length), [cells, worlds.length])
  const snapTargets = useMemo(() => worldCells.map((c) => c.index), [worldCells])

  // push layout to the engine after children have registered their motion values
  useLayoutEffect(() => {
    engine.setLayout(cells, snapTargets, (minDim / 2) * 1.3)
  }, [engine, cells, snapTargets, minDim])

  useEffect(() => {
    onCenterChange(Math.min(activeCell, worlds.length - 1))
  }, [activeCell, onCenterChange, worlds.length])

  // warm the lazy world chunk when the browser is idle so the first expand never waits on the network
  useEffect(() => {
    const id = window.setTimeout(() => void preloadWorld(), 1200)
    return () => window.clearTimeout(id)
  }, [])

  // restore focus to the icon that opened a world once the overlay closes
  useEffect(() => {
    if (active) lastFocused.current?.focus({ preventScroll: true })
  }, [active])

  // pointer gestures (native listeners so we can capture the pointer only once a drag starts)
  useEffect(() => {
    const el = fieldRef.current
    if (!el) return
    const down = (e: PointerEvent) => engine.pointerDown(e)
    const move = (e: PointerEvent) => {
      if (engine.pointerMove(e)) el.setPointerCapture(e.pointerId)
    }
    const up = (e: PointerEvent) => engine.pointerUp(e)
    const wheel = (e: WheelEvent) => engine.wheel(e.deltaX, e.deltaY)
    const swallowClick = (e: MouseEvent) => {
      if (engine.wasDrag) {
        e.stopPropagation()
        e.preventDefault()
      }
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: true })
    el.addEventListener('click', swallowClick, true)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('click', swallowClick, true)
    }
  }, [engine])

  const focusCell = (index: number) => {
    const btn = fieldRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${index}"]`)
    btn?.focus({ preventScroll: true })
    engine.focusCell(index)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = Number((document.activeElement as HTMLElement | null)?.dataset.cell ?? activeCell)
    if (e.key === 'Home') {
      e.preventDefault()
      focusCell(0)
      return
    }
    const dir = ARROWS[e.key]
    if (!dir) return
    e.preventDefault()
    const next = neighbourInDirection(cells, current, dir, (i) => i < worlds.length)
    if (next !== null) focusCell(next)
  }

  const style = { '--cell': `${cellSize}px` } as CSSProperties

  return (
    <div
      ref={fieldRef}
      className={styles.field}
      style={style}
      role="group"
      aria-label="Chapters of our story. Drag to explore, arrow keys to move, Enter to open."
      onKeyDown={onKeyDown}
      inert={!active}
    >
      {cells.map((cell) => {
        const world = worlds[cell.index]
        if (!world) {
          return (
            <LauncherCell key={cell.index} cell={cell} engine={engine} dim>
              <GhostIcon />
            </LauncherCell>
          )
        }
        const locked = isWorldLocked(world)
        return (
          <LauncherCell key={cell.index} cell={cell} engine={engine} dim={false}>
            <WorldIcon
              world={world}
              locked={locked}
              data-cell={cell.index}
              tabIndex={cell.index === activeCell ? 0 : -1}
              onPointerEnter={(e) => {
                void preloadWorld()
                if (locked && e.pointerType === 'mouse') onPeekLocked(world)
              }}
              onPointerLeave={(e) => {
                // touch fires pointerleave right after the tap; only hover-peeks end on leave
                if (locked && e.pointerType === 'mouse' && document.activeElement !== e.currentTarget) onPeekLocked(null)
              }}
              onFocus={(e) => {
                lastFocused.current = e.currentTarget
                if (e.currentTarget.matches(':focus-visible')) engine.focusCell(cell.index)
                if (locked) onPeekLocked(world)
              }}
              onBlur={() => locked && onPeekLocked(null)}
              onClick={() => {
                if (locked) {
                  engine.focusCell(cell.index)
                  onPeekLocked(world)
                } else {
                  onOpen(world)
                }
              }}
            />
          </LauncherCell>
        )
      })}
    </div>
  )
}
