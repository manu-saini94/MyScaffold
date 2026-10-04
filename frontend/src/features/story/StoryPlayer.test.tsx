// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { LazyMotion, domMax } from 'motion/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import sessionReducer from '../session/sessionSlice'
import { api } from '../../services/api'
import type { Experience, LockedWorldSummary, Moment, OpenWorldDetail, OpenWorldSummary } from '../../types/api'
import { MUTE_KEY } from '../../services/music'
import { IDLE_MS } from './StoryPlayer'
import StoryRoute from './StoryRoute'
import { LOCKED_MS, MOMENT_MIN_MS, TITLE_MS } from './timing'

const T0 = '2026-10-01T00:00:00.000Z'
const MUSIC = 'https://example.com/first.mp3'

const moment = (slug: string, i: number, caption: string | null): Moment => ({
  id: `${slug}-m${i}`, sortOrder: i, caption, note: null, happenedOn: '2019-03-02', place: 'Pune', favourite: false,
  media: { mediaId: `${slug.toUpperCase()}${i}`, mimeType: 'image/jpeg', width: 1200, height: 900, lqip: null, dominantColor: null, takenAt: null },
})

const detail = (slug: string, title: string, moments: Moment[], musicUrl: string | null): OpenWorldDetail => ({
  slug, title, subtitle: `${title} subtitle`, tagline: `${title} tagline`, layout: 'POLAROID_TABLE', themeAccent: '#d6304f',
  locked: false, introText: null, outroText: null, musicUrl, nextSlug: null, serverTime: T0, moments, letters: [],
})

const summary = (w: OpenWorldDetail, sortOrder: number): OpenWorldSummary => ({
  slug: w.slug, title: w.title, subtitle: w.subtitle, tagline: w.tagline, layout: w.layout, themeAccent: w.themeAccent,
  sortOrder, locked: false, momentCount: w.moments.length, cover: null, previewMediaIds: [],
})

const FIRST = detail('first', 'First', [moment('first', 1, 'First coffee'), moment('first', 2, 'Rain')], MUSIC)
const LAST = detail('last', 'Last', [moment('last', 1, 'Home')], null)
const LATER: LockedWorldSummary = {
  slug: 'later', title: 'Later', subtitle: null, layout: 'CONSTELLATION', themeAccent: null, sortOrder: 2, locked: true,
  unlockAt: '2026-10-04T04:25:00.000Z',
}
const EXPERIENCE: Experience = {
  serverTime: T0, appTitle: 'Anvi ❤ Manu', tagline: null, defaultTheme: 'rose', specialDate: null, easterEggNicknames: [],
  profiles: [], hero: [],
  // deliberately out of order: the story sorts by sortOrder
  worlds: [summary(LAST, 3), LATER, summary(FIRST, 1)],
}

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

let calls: string[] = []
let reduced = false

function stubFetch() {
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (req: Request) => {
      const path = new URL(req.url).pathname
      calls.push(path)
      if (path === '/api/experience') return json(EXPERIENCE)
      if (path === '/api/worlds/first') return json(FIRST)
      if (path === '/api/worlds/last') return json(LAST)
      return new Response(JSON.stringify({ type: 'urn:ourstory:problem:not-found', title: 'x', status: 404 }), { status: 404 })
    }),
  )
}

const flush = (ms = 0) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))

function renderStory() {
  const store = configureStore({
    reducer: { session: sessionReducer, [api.reducerPath]: api.reducer },
    middleware: (gd) => gd().concat(api.middleware),
  })
  const view = render(
    <Provider store={store}>
      <LazyMotion features={domMax} strict>
        <MemoryRouter initialEntries={['/story']}>
          <Routes>
            <Route path="/" element={<p>home page</p>} />
            <Route path="/story" element={<StoryRoute clock={() => Date.now()} />} />
          </Routes>
        </MemoryRouter>
      </LazyMotion>
    </Provider>,
  )
  return { ...view, store }
}

/** What the screen-reader live region says is on screen now (exiting slides may still be fading out). */
const onScreen = () => document.querySelector('[aria-live="polite"]')?.textContent ?? ''
const stage = () => document.querySelector<HTMLElement>('[data-click-effect="none"]')!

/** Renders, waits on the curtain until the first chapter and the one fetched ahead have arrived, then presses Play. */
async function startStory() {
  const { store } = renderStory()
  const loaded = (slug: string) => store.getState().api.queries[`getWorld("${slug}")`]?.status === 'fulfilled'
  await vi.waitFor(() => expect(loaded('first') && loaded('last')).toBe(true))
  fireEvent.click(screen.getByRole('button', { name: 'Play' }))
  await flush()
}

let play: ReturnType<typeof vi.fn>

beforeEach(() => {
  // setImmediate stays real: the fetch Response body is read through it
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(new Date(T0))
  reduced = false
  localStorage.clear()
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduced && query.includes('reduce'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  play = vi.fn(() => Promise.resolve())
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play as unknown as () => Promise<void>)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
  stubFetch()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('StoryPlayer', () => {
  it('waits on the curtain and plays no music before the Play press', async () => {
    renderStory()
    await vi.waitFor(() => screen.getByRole('heading', { name: 'Anvi ❤ Manu' }))
    await flush(20_000)
    expect(screen.getByText('Our story · 3 chapters')).toBeTruthy()
    expect(play).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    await flush()
    expect(onScreen()).toBe('Chapter 1: First')
    expect(play).toHaveBeenCalledTimes(1)
    expect((play.mock.contexts[0] as HTMLAudioElement).src).toBe(MUSIC)
    // a short song repeats until the chapter ends
    expect((play.mock.contexts[0] as HTMLAudioElement).loop).toBe(true)
    // the first chapter and the next open one are fetched while the curtain is up; the locked one never is
    expect(calls).toContain('/api/worlds/first')
    expect(calls).toContain('/api/worlds/last')
    expect(calls).not.toContain('/api/worlds/later')
  })

  it('plays every chapter in order, types captions, shows the locked card, and ends on the final card', async () => {
    await startStory()
    expect(screen.getByRole('heading', { name: 'First' })).toBeTruthy()
    expect(screen.getByText('First tagline')).toBeTruthy()

    await flush(TITLE_MS)
    expect(onScreen()).toBe('Photo 1 of 2')
    const caption = () => screen.getAllByTestId('caption').at(-1)!
    expect(caption().dataset.typed).toBe('0')
    await flush(850) // a whole number of 50 ms ticks: 150 ms into typing at 45 ms a letter
    expect(caption().dataset.typed).toBe('4')
    expect(caption().textContent).toContain('First coffee') // the full sentence is there for screen readers

    await flush(MOMENT_MIN_MS)
    expect(onScreen()).toBe('Photo 2 of 2')
    await flush(MOMENT_MIN_MS)
    expect(onScreen()).toBe('Chapter 2, Later, is still waiting')
    expect(screen.getByText('A chapter still waiting…')).toBeTruthy()
    expect(screen.getByRole('timer').textContent).toMatch(/^3d 04h 2[45]m \d\ds$/) // ~20 s of story have played

    await flush(LOCKED_MS)
    expect(onScreen()).toBe('Chapter 3: Last')
    await flush(TITLE_MS + MOMENT_MIN_MS)
    expect(onScreen()).toBe('The end of the story, for now.')
    expect(screen.getByText('To be continued…')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back home' }).getAttribute('href')).toBe('/')
    expect(calls).not.toContain('/api/worlds/later')
  })

  it('pauses, steps, and skips chapters with buttons and keys', async () => {
    await startStory()
    fireEvent.click(screen.getByRole('button', { name: 'Pause (Space)' }))
    await flush(60_000)
    expect(onScreen()).toBe('Chapter 1: First (paused)')

    fireEvent.click(screen.getByRole('button', { name: 'Next photo (Right arrow)' }))
    await flush()
    expect(onScreen()).toBe('Photo 1 of 2 (paused)')

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    await flush()
    expect(onScreen()).toBe('Photo 2 of 2 (paused)')
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    await flush()
    expect(onScreen()).toBe('Photo 1 of 2 (paused)')

    fireEvent.keyDown(window, { key: 'n' })
    await flush()
    expect(onScreen()).toBe('Chapter 2, Later, is still waiting (paused)')
    fireEvent.click(screen.getByRole('button', { name: 'Skip chapter (N)' }))
    await flush()
    expect(onScreen()).toBe('Chapter 3: Last (paused)')

    fireEvent.keyDown(window, { key: ' ' })
    await flush()
    expect(onScreen()).toBe('Chapter 3: Last')
    expect(screen.getByRole('button', { name: 'Pause (Space)' })).toBeTruthy()
  })

  it('hides the controls after a quiet spell and brings them back on pointer move', async () => {
    await startStory()
    expect(stage().dataset.ui).toBe('shown')
    await flush(IDLE_MS + 100)
    expect(stage().dataset.ui).toBe('hidden')
    fireEvent.pointerMove(window)
    await flush()
    expect(stage().dataset.ui).toBe('shown')
    await flush(IDLE_MS + 100)
    expect(stage().dataset.ui).toBe('hidden')
    fireEvent.keyDown(window, { key: 'Shift' })
    await flush()
    expect(stage().dataset.ui).toBe('shown')
  })

  it('leaves for the home on Escape', async () => {
    await startStory()
    fireEvent.keyDown(window, { key: 'Escape' })
    await flush()
    expect(screen.getByText('home page')).toBeTruthy()
  })

  it('remembers the mute switch and applies it to the music', async () => {
    await startStory()
    const mute = screen.getByRole('button', { name: 'Mute music' })
    expect(mute.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(mute)
    await flush()
    expect(localStorage.getItem(MUTE_KEY)).toBe('1')
    expect((play.mock.contexts[0] as HTMLAudioElement).muted).toBe(true)
    cleanup()

    await startStory()
    expect(screen.getByRole('button', { name: 'Mute music' }).getAttribute('aria-pressed')).toBe('true')
    expect((play.mock.contexts.at(-1) as HTMLAudioElement).muted).toBe(true)
  })

  it('with reduced motion shows the whole caption at once and does not pan', async () => {
    reduced = true
    await startStory()
    await flush(TITLE_MS)
    expect(screen.getAllByTestId('caption').at(-1)!.dataset.typed).toBe(String('First coffee'.length))
    expect(document.querySelector('[class*="kenBurns"]')).toBeNull()
  })
})

describe('StoryPlayer in a background tab', () => {
  let hidden = false
  const setHidden = (h: boolean) =>
    act(() => {
      hidden = h
      document.dispatchEvent(new Event('visibilitychange'))
    })

  beforeEach(() => {
    hidden = false
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  })
  afterEach(() => {
    delete (document as { hidden?: boolean }).hidden
  })

  it('holds the slide clock and the music while hidden and carries on when visible again', async () => {
    await startStory()
    expect(onScreen()).toBe('Chapter 1: First')
    const pause = vi.mocked(HTMLMediaElement.prototype.pause)
    pause.mockClear()

    setHidden(true)
    await flush(TITLE_MS * 3)
    expect(onScreen()).toMatch(/^Chapter 1: First/)
    expect(pause).toHaveBeenCalled()

    play.mockClear()
    setHidden(false)
    await flush()
    expect(onScreen()).toBe('Chapter 1: First')
    expect(play).toHaveBeenCalled()
    await flush(TITLE_MS + 100)
    expect(onScreen()).toBe('Photo 1 of 2')
  })

  it('stays paused on return when the visitor had paused', async () => {
    await startStory()
    fireEvent.click(screen.getByRole('button', { name: 'Pause (Space)' }))
    setHidden(true)
    await flush(TITLE_MS)
    setHidden(false)
    await flush(TITLE_MS * 2)
    expect(onScreen()).toBe('Chapter 1: First (paused)')
  })
})
