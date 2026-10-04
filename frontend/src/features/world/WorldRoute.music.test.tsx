// @vitest-environment jsdom
import { useEffect } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { LazyMotion, MotionGlobalConfig, domMax } from 'motion/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom'
import sessionReducer from '../session/sessionSlice'
import { api } from '../../services/api'
import { MUSIC_VOLUME, MUTE_KEY } from '../../services/music'
import { resetServerClock } from '../../services/serverClock'
import type { WorldDetail } from '../../types/api'
import { installDomStubs, json, lockedWorld, openWorld } from './test-support'
import WorldRoute from './WorldRoute'

vi.mock('../../worlds/PolaroidTable/index', async () => ({
  default: (await import('../../worlds/_placeholder/PlaceholderLayout')).PlaceholderLayout,
}))

const THEME = '/assets/music/kadhalar-dhinam-theme.mp3'
const OTHER = '/assets/music/tori-harper-after-dark.mp3'

let play: ReturnType<typeof vi.fn>
let pause: ReturnType<typeof vi.fn>
let navigate: NavigateFunction
let worlds: Record<string, WorldDetail>
let hidden = false

/** Every audio element that play() was called on, in order, without repeats. */
const played = () => [...new Set(play.mock.contexts as HTMLAudioElement[])]
function track(i: number): HTMLAudioElement {
  const audio = played()[i]
  if (!audio) throw new Error(`no audio element #${i} was played`)
  return audio
}
const flush = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

function NavigateProbe() {
  const nav = useNavigate()
  useEffect(() => {
    navigate = nav
  }, [nav])
  return null
}

/** Like the app's Shell: the world route is a new element per pathname, so a chapter change remounts it. */
function KeyedWorld() {
  return <WorldRoute key={useLocation().pathname} />
}

async function open(path: string) {
  const store = configureStore({
    reducer: { session: sessionReducer, [api.reducerPath]: api.reducer },
    middleware: (gd) => gd().concat(api.middleware),
  })
  render(
    <Provider store={store}>
      <LazyMotion features={domMax} strict>
        <MemoryRouter initialEntries={[path]}>
          <NavigateProbe />
          <Routes>
            <Route path="/" element={<p>launcher</p>} />
            <Route path="/world/:slug" element={<KeyedWorld />} />
          </Routes>
        </MemoryRouter>
      </LazyMotion>
    </Provider>,
  )
  await flush()
  await vi.waitFor(() => expect(screen.getByRole('link', { name: 'All chapters' })).toBeTruthy())
  await vi.waitFor(() => expect(screen.queryByRole('heading', { name: 'Opening chapter' })).toBeNull())
}

async function go(path: string) {
  await act(async () => {
    await navigate(path)
  })
  await flush()
}

function setHidden(next: boolean) {
  hidden = next
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') })
})
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false
})
beforeEach(() => {
  // setImmediate stays real: the fetch Response body is read through it
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  localStorage.clear()
  hidden = false
  installDomStubs()
  worlds = {
    'our-firsts': openWorld({ musicUrl: THEME, nextSlug: 'same-song' }),
    'same-song': openWorld({ slug: 'same-song', title: 'Same Song', musicUrl: THEME }),
    'other-song': openWorld({ slug: 'other-song', title: 'Other Song', musicUrl: OTHER }),
    silent: openWorld({ slug: 'silent', title: 'Silent', musicUrl: null }),
    'our-forever': lockedWorld({ unlockAt: '2099-01-01T00:00:00Z' }),
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (req: Request) => {
      const slug = new URL(req.url).pathname.split('/').pop() ?? ''
      return json(worlds[slug] ?? { status: 404 }, worlds[slug] ? 200 : 404)
    }),
  )
  play = vi.fn(() => Promise.resolve())
  pause = vi.fn()
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play as unknown as () => Promise<void>)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pause as unknown as () => void)
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)
})
afterEach(async () => {
  cleanup()
  // let the closing fade finish so the shared player is idle for the next test
  await vi.advanceTimersByTimeAsync(5000)
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  resetServerClock()
})

describe('world music', () => {
  it('plays the world track looped on open and fades it in', async () => {
    await open('/world/our-firsts')
    expect(played()).toHaveLength(1)
    const audio = track(0)
    expect(audio.getAttribute('src')).toBe(THEME)
    expect(audio.loop).toBe(true)
    expect(audio.volume).toBeLessThan(0.2)
    await flush(1300)
    expect(audio.volume).toBeCloseTo(MUSIC_VOLUME)
    expect(screen.getByRole('button', { name: 'Mute music' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('shows the tap state when the browser refuses autoplay and starts on the first tap', async () => {
    play.mockImplementationOnce(() => Promise.reject(new DOMException('no gesture', 'NotAllowedError')))
    await open('/world/our-firsts')
    const tap = await vi.waitFor(() => screen.getByRole('button', { name: 'Tap for music ♪' }))
    fireEvent.click(tap)
    await flush()
    expect(play).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: 'Mute music' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('shares the mute switch with story mode', async () => {
    localStorage.setItem(MUTE_KEY, '1')
    await open('/world/our-firsts')
    expect(play).not.toHaveBeenCalled()
    const toggle = screen.getByRole('button', { name: 'Mute music' })
    expect(toggle.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(toggle)
    await flush()
    expect(play).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(MUTE_KEY)).toBe('0')

    fireEvent.click(toggle)
    expect(pause).toHaveBeenCalled()
    expect(localStorage.getItem(MUTE_KEY)).toBe('1')
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
  })

  it('keeps the same track playing across Next chapter and crossfades to a different one', async () => {
    await open('/world/our-firsts')
    await flush(1300)
    const first = track(0)

    await go('/world/same-song')
    await vi.waitFor(() => screen.getByRole('heading', { name: 'Same Song' }))
    await flush(2000)
    expect(played()).toEqual([first])
    expect(pause).not.toHaveBeenCalled()
    expect(first.volume).toBeCloseTo(MUSIC_VOLUME)

    await go('/world/other-song')
    await vi.waitFor(() => screen.getByRole('heading', { name: 'Other Song' }))
    const second = track(1)
    expect(second.getAttribute('src')).toBe(OTHER)
    expect(second.loop).toBe(true)
    await flush(600)
    expect(first.volume).toBeGreaterThan(0)
    expect(first.volume).toBeLessThan(MUSIC_VOLUME)
    expect(second.volume).toBeGreaterThan(0)
    await flush(800)
    expect(pause.mock.contexts).toContain(first)
    expect(first.hasAttribute('src')).toBe(false)
    expect(pause.mock.contexts).not.toContain(second)
  })

  it('fades out, stops and releases the track when the world closes', async () => {
    await open('/world/our-firsts')
    const audio = track(0)
    await go('/')
    expect(screen.getByText('launcher')).toBeTruthy()
    await flush(1300)
    expect(pause.mock.contexts).toContain(audio)
    expect(audio.hasAttribute('src')).toBe(false)
  })

  it('pauses while the tab is hidden and resumes on return unless muted', async () => {
    await open('/world/our-firsts')
    setHidden(true)
    expect(pause).toHaveBeenCalledTimes(1)
    setHidden(false)
    expect(play).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('button', { name: 'Mute music' }))
    setHidden(true)
    setHidden(false)
    expect(play).toHaveBeenCalledTimes(2)
  })

  it('plays nothing for a locked world or a world without music', async () => {
    await open('/world/our-forever')
    await vi.waitFor(() => screen.getByRole('timer'))
    expect(screen.queryByRole('button', { name: /music/i })).toBeNull()
    cleanup()
    await open('/world/silent')
    await vi.waitFor(() => screen.getByRole('heading', { name: 'Silent' }))
    expect(play).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /music/i })).toBeNull()
  })

  it('starts and stops at once under reduced motion', async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    await open('/world/our-firsts')
    const audio = track(0)
    expect(audio.volume).toBeCloseTo(MUSIC_VOLUME)
    await go('/')
    expect(pause.mock.contexts).toContain(audio)
  })
})
