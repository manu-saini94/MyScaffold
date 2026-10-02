import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { m } from 'motion/react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import type { WorldLayoutProps } from '../types'
import { Polaroid } from './Polaroid'
import { bringToFront, layoutTable } from './table'
import styles from './PolaroidTable.module.scss'

/** Width of the table in px, kept fresh by a ResizeObserver; 0 until measured. */
function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}

/** "Where it all began": polaroids scattered on a linen table. Drag, turn over, look closer. */
export default function PolaroidTable({ world, onFinished, onOpenPhoto }: WorldLayoutProps) {
  const { moments } = world
  const count = moments.length
  const reduced = useReducedMotion()
  const tableRef = useRef<HTMLDivElement>(null)
  const measured = useWidth(tableRef)
  // without ResizeObserver (old browsers, tests) the layout falls back to its minimum width
  const ready = measured > 0 || typeof ResizeObserver === 'undefined'
  const ids = useMemo(() => moments.map((mo) => mo.id), [moments])
  const table = useMemo(() => layoutTable(ids, measured), [ids, measured])

  const [order, setOrder] = useState<string[]>(ids)
  const [flipped, setFlipped] = useState<ReadonlySet<number>>(() => new Set())
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set())
  const allSeen = count > 0 && seen.size === count

  useEffect(() => {
    if (count === 0 || allSeen) onFinished()
  }, [count, allSeen, onFinished])

  const onFlip = useCallback((index: number) => {
    setFlipped((prev) => {
      const next = new Set(prev)
      if (!next.delete(index)) next.add(index)
      return next
    })
    setSeen((prev) => (prev.has(index) ? prev : new Set(prev).add(index)))
  }, [])

  const onLift = useCallback((id: string) => setOrder((prev) => bringToFront(prev, id)), [])

  if (count === 0) {
    return (
      <div className={styles.layout}>
        <div className={`${styles.table} ${styles.bare}`}>
          <p className={styles.empty}>The table is bare for now. The first photos are still on their way.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.layout}>
      <p className={styles.hint}>
        {table.columns > 1 ? 'Drag them around · tap to turn over' : 'Tap to turn over'} · double-tap to look closer
      </p>

      <m.div
        ref={tableRef}
        className={styles.table}
        style={{ height: table.height }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        role="group"
        data-click-effect="none"
        aria-label={`${count} polaroids on a table. Tab between them, Enter turns one over, O opens it.`}
      >
        {ready &&
          moments.map((moment, i) => {
            const spot = table.cards[i]
            if (!spot) return null
            return (
              <Polaroid
                key={moment.id}
                moment={moment}
                index={i}
                label={moment.caption ?? `Photo ${i + 1} of ${count}`}
                spot={spot}
                width={table.cardWidth}
                z={order.indexOf(moment.id) + 1}
                flipped={flipped.has(i)}
                reduced={reduced}
                axis={table.columns === 1 ? 'x' : true}
                tableRef={tableRef}
                onFlip={onFlip}
                onOpen={onOpenPhoto}
                onLift={onLift}
              />
            )
          })}
      </m.div>

      <div className={styles.foot}>
        <p className={styles.tally} aria-live="polite">
          {allSeen ? 'Every one of them, turned over.' : `Turned over ${seen.size} of ${count}`}
        </p>
        {!allSeen && (
          <button type="button" className={styles.done} onClick={onFinished}>
            That's all of them
          </button>
        )}
      </div>
    </div>
  )
}
