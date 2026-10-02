import '@fontsource/fraunces/latin-400-italic.css'
import { useCallback, useEffect, useReducer, useRef } from 'react'
import { m } from 'motion/react'
import { ProgressiveImage } from '../../components/ProgressiveImage/ProgressiveImage'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { mediaUrl } from '../../services/media'
import type { WorldLayoutProps } from '../types'
import { EnvelopeArt } from './EnvelopeArt'
import { PhotoStage } from './PhotoStage'
import { autoDelay, initialUnfold, keyMomentIndex, REDUCED_TIMING, TIMING, unfoldReducer } from './unfold'
import styles from './Envelope.module.scss'

/** "The question": a sealed envelope; the seal breaks, a letter rises, and the photos unfold one by one. */
export default function Envelope({ world, onFinished, onOpenPhoto }: WorldLayoutProps) {
  const { moments } = world
  const reduced = useReducedMotion()
  const [state, dispatch] = useReducer(unfoldReducer, moments.length, initialUnfold)
  const keyIndex = keyMomentIndex(moments)
  const nextRef = useRef<HTMLButtonElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const { stage, shown, total, playing } = state
  const empty = moments.length === 0

  useEffect(() => {
    const delay = autoDelay(state, reduced ? REDUCED_TIMING : TIMING)
    if (delay === null) return
    const timer = window.setTimeout(() => dispatch({ type: 'advance' }), delay)
    return () => window.clearTimeout(timer)
  }, [state, reduced])

  useEffect(() => {
    if (stage === 'done' || empty) onFinished()
  }, [stage, empty, onFinished])

  // the seal button is gone once broken: hand focus to the controls so keyboard users keep their place
  useEffect(() => {
    if (stage === 'letter') nextRef.current?.focus({ preventScroll: true })
  }, [stage])

  const photosStarted = stage === 'photos' || stage === 'done'
  useEffect(() => {
    if (photosStarted) stageRef.current?.scrollIntoView?.({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' })
  }, [photosStarted, reduced])

  // warm the next photo so it unfolds already decoded
  useEffect(() => {
    const next = moments[photosStarted ? shown : 0]
    if (next && stage !== 'sealed') new Image().src = mediaUrl(next.media.mediaId, 'medium')
  }, [moments, shown, photosStarted, stage])

  const openPhoto = useCallback(
    (i: number) => {
      dispatch({ type: 'pause' })
      onOpenPhoto(i)
    },
    [onOpenPhoto],
  )

  if (empty) {
    return (
      <div className={styles.layout}>
        <EnvelopeArt world={world} open={false} reduced={reduced} />
        <p className={styles.hint}>This letter is still being written.</p>
      </div>
    )
  }

  const current = Math.max(0, shown - 1)
  const showControls = stage === 'letter' || stage === 'photos'
  const isLast = stage === 'photos' && shown >= total

  return (
    <div className={styles.layout} data-split={photosStarted || undefined}>
      <m.div layout={!reduced} className={styles.envCol} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}>
        <EnvelopeArt world={world} open={stage !== 'sealed'} onBreak={() => dispatch({ type: 'open' })} reduced={reduced} />

        {stage === 'sealed' && (
          <m.p
            className={styles.hint}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reduced ? 0 : 0.6, duration: 0.8 }}
          >
            Tap the seal to open
          </m.p>
        )}
      </m.div>

      <div ref={stageRef} className={styles.below}>
        {photosStarted && (
          <PhotoStage moments={moments} current={current} keyIndex={keyIndex} reduced={reduced} onOpen={openPhoto} />
        )}

        {showControls && (
          <div className={styles.controls}>
            <span className={styles.counter} aria-live="polite">
              {stage === 'letter' ? `${total} ${total === 1 ? 'photo' : 'photos'} inside` : `${shown} / ${total}`}
            </span>
            <button
              type="button"
              className={styles.ctrl}
              onClick={() => dispatch({ type: 'toggle' })}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {playing ? <path d="M8 5h3v14H8zM13 5h3v14h-3z" /> : <path d="M8 5l11 7-11 7z" />}
              </svg>
            </button>
            <button ref={nextRef} type="button" className={styles.next} onClick={() => dispatch({ type: 'advance' })}>
              {stage === 'letter' ? 'Open the photos' : isLast ? 'The end' : 'Next'}
            </button>
          </div>
        )}

        {photosStarted && (
          <ol className={styles.keepsakes} aria-label="Photos so far">
            {moments.slice(0, stage === 'done' ? total : shown).map((mo, i) => (
              <li key={mo.id}>
                <button
                  type="button"
                  className={styles.keepsake}
                  data-current={(i === current && stage !== 'done') || undefined}
                  onClick={() => openPhoto(i)}
                  aria-label={`Open photo ${i + 1}${mo.caption ? `: ${mo.caption}` : ''}`}
                >
                  <ProgressiveImage media={mo.media} alt="" sizes="4rem" className={styles.keepsakeImg} />
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
