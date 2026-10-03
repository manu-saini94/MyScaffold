import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { skipToken } from '@reduxjs/toolkit/query/react'
import { AnimatePresence, m } from 'motion/react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { useGetWorldQuery } from '../../services/experienceApi'
import { mediaSrcSet, mediaUrl } from '../../services/media'
import { BottomBar, TopBar, type ChapterProgress } from './Controls'
import { readMuted, safeMusicUrl, writeMuted } from './music'
import { nextOpenSlug, resolveChapter, slideAt, slideCount, type Chapter, type ChapterContent } from './playlist'
import { FinalCard, LockedCard, PhotoSlide, TitleCard } from './Slides'
import {
  advanceIfDue,
  elapsedMs,
  firstShown,
  isEnd,
  moveTo,
  nextChapterPos,
  nextPos,
  prevPos,
  setPlaying,
  startState,
  type Outline,
  type StoryState,
} from './storyMachine'
import { slideDuration } from './timing'
import { useAwake } from './useAwake'
import { useStoryMusic } from './useStoryMusic'
import styles from './Story.module.scss'

/** Drives the progress bar, the typing and the slide clock. */
const TICK_MS = 50
export const IDLE_MS = 3000

export type Clock = () => number
const defaultClock: Clock = () => performance.now()

/** Loads one chapter's world (skipped for locked chapters and past the end) and resolves what it plays. */
function useChapterContent(chapter: Chapter | undefined): ChapterContent {
  const slug = chapter?.kind === 'open' ? chapter.slug : null
  const { data, isError } = useGetWorldQuery(slug ?? skipToken)
  return chapter ? resolveChapter(chapter, data, isError) : { kind: 'missing' }
}

function preload(mediaId: string) {
  const img = new Image()
  img.sizes = '100vw'
  img.srcset = mediaSrcSet(mediaId)
  img.src = mediaUrl(mediaId, 'medium')
}

const isControl = (t: EventTarget | null) => t instanceof Element && !!t.closest('button, a, input, textarea, select')

interface Props {
  chapters: readonly Chapter[]
  appTitle: string
  clock?: Clock
}

/**
 * The story: a curtain with one Play button (the gesture that allows music), then every chapter in order, then the
 * final card. Only the current chapter and the next open one are fetched (the next one ahead of time).
 */
export function StoryPlayer({ chapters, appTitle, clock = defaultClock }: Props) {
  const navigate = useNavigate()
  const reduced = useReducedMotion()
  const awake = useAwake(IDLE_MS)
  const [story, setStory] = useState<StoryState | null>(null)
  const [now, setNow] = useState(clock)
  const [muted, setMuted] = useState(readMuted)

  const pos = story?.pos ?? { chapter: 0, slide: 0 }
  const aheadSlug = nextOpenSlug(chapters, pos.chapter)
  const aheadIndex = chapters.findIndex((c) => c.slug === aheadSlug)
  const content = useChapterContent(chapters[pos.chapter])
  const ahead = useChapterContent(aheadIndex >= 0 ? chapters[aheadIndex] : undefined)

  const currentCount = slideCount(content)
  const aheadCount = slideCount(ahead)
  const outline: Outline = useMemo(
    () =>
      chapters.map((c, i) => {
        if (i === pos.chapter) return currentCount
        if (i === aheadIndex) return aheadCount
        return c.kind === 'locked' ? 1 : null
      }),
    [chapters, pos.chapter, aheadIndex, currentCount, aheadCount],
  )

  const view = slideAt(chapters, pos.chapter, pos.slide, content)
  const duration = slideDuration(view)
  const ended = story !== null && isEnd(pos, outline)
  const playing = !!story?.playing && !ended
  const elapsed = story ? elapsedMs(story, now) : 0

  // The slide clock. A chapter that turned out empty (failed or no longer there) is skipped on the next tick.
  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => {
      const t = clock()
      setNow(t)
      setStory((s) => {
        if (!s) return s
        if (outline[s.pos.chapter] === 0) return moveTo(s, { chapter: firstShown(outline, s.pos.chapter), slide: 0 }, t)
        return advanceIfDue(s, t, duration, outline)
      })
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [playing, duration, outline, clock])

  // Fetch the next photo before it is due.
  const following = nextPos(pos, outline)
  const followingMedia = following ? slideAt(chapters, following.chapter, following.slide, following.chapter === pos.chapter ? content : ahead) : null
  const preloadId = followingMedia?.kind === 'moment' ? followingMedia.moment.media.mediaId : null
  const started = story !== null
  useEffect(() => {
    if (started && preloadId) preload(preloadId)
  }, [started, preloadId])

  const musicUrl = !ended && content.kind === 'open' ? safeMusicUrl(content.world.musicUrl) : null
  useStoryMusic({ url: musicUrl, enabled: started, playing, muted })

  const begin = useCallback(() => {
    const t = clock()
    setNow(t)
    setStory(startState(t))
  }, [clock])

  /** Applies one control action at a single clock reading. */
  const apply = useCallback(
    (move: (s: StoryState, t: number) => StoryState) => {
      const t = clock()
      setNow(t)
      setStory((s) => (s ? move(s, t) : s))
    },
    [clock],
  )
  const toggle = useCallback(() => apply((s, t) => setPlaying(s, !s.playing, t)), [apply])

  // A hidden tab holds the slide clock (and with it the music); it resumes on return only if it was playing.
  const playingRef = useRef(playing)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])
  useEffect(() => {
    let heldByHide = false
    const onVisibility = () => {
      if (document.hidden) {
        if (!playingRef.current) return
        heldByHide = true
        apply((s, t) => setPlaying(s, false, t))
      } else if (heldByHide) {
        heldByHide = false
        apply((s, t) => setPlaying(s, true, t))
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [apply])
  const goNext = useCallback(() => apply((s, t) => moveTo(s, nextPos(s.pos, outline) ?? s.pos, t)), [apply, outline])
  const goPrev = useCallback(() => apply((s, t) => moveTo(s, prevPos(s.pos, outline), t)), [apply, outline])
  const skip = useCallback(() => apply((s, t) => moveTo(s, nextChapterPos(s.pos, outline), t)), [apply, outline])
  const exit = useCallback(() => void navigate('/'), [navigate])
  const toggleMute = useCallback(() => {
    setMuted((v) => {
      writeMuted(!v)
      return !v
    })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Escape') {
        e.preventDefault()
        exit()
        return
      }
      if (!started) return
      if (e.key === ' ' || e.key === 'Spacebar') {
        if (isControl(e.target)) return // a focused button answers Space itself
        e.preventDefault()
        if (!ended) toggle()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        goNext()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrev()
      } else if (e.key === 'n' || e.key === 'N') {
        skip()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [started, ended, exit, toggle, goNext, goPrev, skip])

  const chapter = chapters[pos.chapter]
  const progress: ChapterProgress | null =
    story && !ended && chapter
      ? {
          label: `${pos.chapter + 1} / ${chapters.length} · ${chapter.title}`,
          count: Math.max(1, outline[pos.chapter] ?? 1),
          current: pos.slide,
          fraction: Number.isFinite(duration) ? Math.min(1, elapsed / duration) : 0,
        }
      : null

  const uiVisible = !story || !playing || awake
  const slideKey = `${pos.chapter}:${pos.slide}`

  return (
    <div className={styles.stage} data-click-effect="none" data-ui={uiVisible ? 'shown' : 'hidden'}>
      {story ? (
        <AnimatePresence initial={false}>
          <m.div
            key={slideKey}
            className={styles.slide}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 1.1, ease: 'easeInOut' } }}
            exit={{ opacity: 0, transition: { duration: 1.1, ease: 'easeInOut' } }}
          >
            {view.kind === 'title' && <TitleCard view={view} />}
            {view.kind === 'locked' && <LockedCard view={view} />}
            {view.kind === 'final' && <FinalCard />}
            {view.kind === 'moment' && (
              <PhotoSlide
                moment={view.moment}
                title={view.world.title}
                index={view.index}
                duration={duration}
                elapsed={elapsed}
                playing={playing}
                reduced={reduced}
              />
            )}
          </m.div>
        </AnimatePresence>
      ) : (
        <Curtain appTitle={appTitle} chapters={chapters.length} onPlay={begin} onExit={exit} />
      )}

      {story && (
        <div className={styles.chrome}>
          <TopBar progress={progress} onExit={exit} />
          <BottomBar
            playing={playing}
            ended={ended}
            music={musicUrl !== null}
            muted={muted}
            onToggle={toggle}
            onPrev={goPrev}
            onNext={goNext}
            onSkip={skip}
            onMute={toggleMute}
          />
        </div>
      )}
      <p className={styles.srOnly} aria-live="polite">
        {story ? announce(view, playing) : ''}
      </p>
    </div>
  )
}

function announce(view: ReturnType<typeof slideAt>, playing: boolean): string {
  const state = playing ? '' : ' (paused)'
  switch (view.kind) {
    case 'title':
      return `Chapter ${view.number}: ${view.title}${state}`
    case 'locked':
      return `Chapter ${view.number}, ${view.title}, is still waiting${state}`
    case 'moment':
      return `Photo ${view.index + 1} of ${view.world.moments.length}${state}`
    case 'final':
      return 'The end of the story, for now.'
  }
}

function Curtain({ appTitle, chapters, onPlay, onExit }: { appTitle: string; chapters: number; onPlay: () => void; onExit: () => void }) {
  return (
    <div className={`${styles.card} ${styles.curtain}`}>
      <p className={styles.eyebrow}>Our story · {chapters === 1 ? '1 chapter' : `${chapters} chapters`}</p>
      <h1 className={styles.cardTitle}>{appTitle}</h1>
      <button type="button" className={styles.goldButton} onClick={onPlay} autoFocus>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
        </svg>
        Play
      </button>
      <button type="button" className={styles.textButton} onClick={onExit}>
        Back home
      </button>
    </div>
  )
}
