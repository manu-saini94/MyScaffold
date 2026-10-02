import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import type { WorldLayoutProps } from '../types'
import { Postcard } from './Postcard'
import { initStack, isDone, position, stackReducer, tiltFor, type Dir } from './stack'
import styles from './Postcards.module.scss'

/** Cards drawn under the top one (the rest of the deck is not rendered). */
const VISIBLE = 3

/** "Adventures together": a deck of postcards. Swipe the top one away, turn it over, shuffle back at the end. */
export default function Postcards({ world, onFinished, onOpenPhoto }: WorldLayoutProps) {
  const { moments } = world
  const count = moments.length
  const reduced = useReducedMotion()
  const [state, dispatch] = useReducer(stackReducer, count, initStack)
  const [keyboard, setKeyboard] = useState(false)
  // true once no card is mid-flight; the empty deck only collapses then, so the last card never squashes
  const [settled, setSettled] = useState(true)
  const deckRef = useRef<HTMLDivElement>(null)
  const done = isDone(state)

  useEffect(() => {
    if (done) onFinished()
  }, [done, onFinished])

  const deckWidth = useCallback(() => deckRef.current?.clientWidth ?? 360, [])
  const send = useCallback((dir: Dir) => {
    setSettled(false)
    dispatch({ type: 'next', dir })
  }, [])
  const back = useCallback(() => dispatch({ type: 'back' }), [])
  const flip = useCallback(() => dispatch({ type: 'flip' }), [])

  if (count === 0) {
    return (
      <div className={styles.layout}>
        <p className={styles.empty}>No postcards yet. The next adventure is still being written.</p>
      </div>
    )
  }

  const shown = moments.slice(state.top, state.top + VISIBLE)
  const label = (i: number) => moments[i]?.caption ?? `Postcard ${i + 1} of ${count}`

  return (
    <div
      className={styles.layout}
      // only keys pressed on a card move focus to the next card; the buttons keep their own focus
      onPointerDown={() => setKeyboard(false)}
      onKeyDown={(e) => setKeyboard(e.target instanceof HTMLElement && e.target.dataset.card !== undefined)}
    >
      <p className={styles.counter} aria-live="polite">
        <span className={styles.srOnly}>Postcard </span>
        {position(state)}
        <span aria-hidden="true"> / </span>
        <span className={styles.srOnly}> of </span>
        {count}
      </p>

      <div ref={deckRef} className={styles.deck} data-done={(done && settled) || undefined} data-click-effect="none" role="group" aria-label="Postcards">
        <AnimatePresence custom={state.last === 'next' ? state.dir : 0} initial={false} onExitComplete={() => setSettled(true)}>
          {shown
            .map((moment, depth) => {
              const index = state.top + depth
              return (
                <Postcard
                  key={moment.id}
                  moment={moment}
                  index={index}
                  label={label(index)}
                  depth={depth}
                  tilt={tiltFor(moment.id)}
                  flipped={depth === 0 && state.flipped}
                  reduced={reduced}
                  fromSide={depth === 0 && state.last === 'back'}
                  takeFocus={keyboard}
                  deckWidth={deckWidth}
                  onSwipe={send}
                  onBack={back}
                  onFlip={flip}
                  onOpen={onOpenPhoto}
                />
              )
            })
            .reverse()}
        </AnimatePresence>

        {done && (
          <m.div
            className={styles.end}
            initial={{ opacity: 0, y: reduced ? 0 : 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: reduced ? 0 : 0.35 }}
          >
            <p className={styles.endTitle}>That's every postcard.</p>
            <button type="button" className={styles.button} onClick={() => dispatch({ type: 'shuffle' })}>
              Shuffle back
            </button>
          </m.div>
        )}
      </div>

      {!done && (
        <div className={styles.controls}>
          <button type="button" className={styles.button} onClick={back} disabled={state.top === 0} aria-label="Previous postcard">
            <span aria-hidden="true">‹</span>
          </button>
          <button type="button" className={styles.button} onClick={flip} aria-pressed={state.flipped}>
            Turn over
          </button>
          <button type="button" className={styles.button} onClick={() => onOpenPhoto(state.top)} aria-label={`Open ${label(state.top)}`}>
            View photo
          </button>
          <button type="button" className={styles.button} onClick={() => send(1)} aria-label="Send it off, next postcard">
            <span aria-hidden="true">›</span>
          </button>
        </div>
      )}
      {!done && <p className={styles.hint}>Swipe it away, tap to turn it over.</p>}
    </div>
  )
}
