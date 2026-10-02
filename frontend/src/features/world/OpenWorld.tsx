import { Suspense, useCallback, useMemo, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { Lightbox } from '../../components/Lightbox/Lightbox'
import { momentsToSlides } from '../../components/Lightbox/slides'
import type { OpenWorldDetail } from '../../types/api'
import { LAYOUTS } from '../../worlds/registry'
import { SealedLetters } from '../letters'
import { IntroCard } from './IntroCard'
import { LayoutBoundary } from './LayoutBoundary'
import { Outro } from './Outro'
import { recordProgress } from './progress'
import styles from './World.module.scss'

/** Progress written as soon as the viewer is past the intro, so the home ring shows "started". */
export const STARTED_PROGRESS = 0.05
/** Viewing photos can take progress this far; only reaching the end (onFinished) makes it 1. */
const PHOTOS_SHARE = 0.95

/** An open world: intro card, then the lazy layout, then (once the layout reports the end) the outro. */
export function OpenWorld({ world }: { world: OpenWorldDetail }) {
  const { slug, moments } = world
  const [phase, setPhase] = useState<'intro' | 'story'>('intro')
  const [finished, setFinished] = useState(false)
  const [photo, setPhoto] = useState<number | null>(null)
  const slides = useMemo(() => momentsToSlides(moments), [moments])
  const Layout = LAYOUTS[world.layout] ?? LAYOUTS.MEMORY_WALL

  const startStory = useCallback(() => {
    setPhase('story')
    recordProgress(slug, STARTED_PROGRESS)
  }, [slug])

  const onOpenPhoto = useCallback(
    (index: number) => {
      if (Number.isInteger(index) && index >= 0 && index < moments.length) setPhoto(index)
    },
    [moments.length],
  )

  const onViewPhoto = useCallback(
    (index: number) => {
      recordProgress(slug, ((index + 1) / Math.max(1, moments.length)) * PHOTOS_SHARE)
    },
    [slug, moments.length],
  )

  const onFinished = useCallback(() => {
    recordProgress(slug, 1)
    setFinished(true)
  }, [slug])

  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        {phase === 'intro' ? (
          <IntroCard key="intro" world={world} onDone={startStory} />
        ) : (
          <m.div key="story" className={styles.story} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.5 } }}>
            <header className={styles.head}>
              <h1 id="world-title" className={styles.title}>
                {world.title}
              </h1>
              {world.tagline && <p className={styles.sub}>{world.tagline}</p>}
            </header>

            <LayoutBoundary>
              <Suspense fallback={<div className={styles.layoutLoading} aria-label="Loading photos" role="status" />}>
                <Layout world={world} onFinished={onFinished} onOpenPhoto={onOpenPhoto} />
              </Suspense>
            </LayoutBoundary>

            <SealedLetters world={world} />
            {finished && <Outro world={world} />}
          </m.div>
        )}
      </AnimatePresence>

      <Lightbox open={photo !== null} slides={slides} index={photo ?? 0} onClose={() => setPhoto(null)} onView={onViewPhoto} />
    </>
  )
}
