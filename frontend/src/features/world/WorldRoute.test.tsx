// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import { resetServerClock } from '../../services/serverClock'
import { PROGRESS_KEY } from './progress'
import { installDomStubs, json, lockedWorld, openWorld, problem, renderWorldAt, showAll, stubFetch } from './test-support'

// The shell is under test, not a layout: the fixture world's layout is swapped for the simple placeholder grid
// (each real layout has its own tests and ends on its own terms, e.g. every polaroid turned over).
vi.mock('../../worlds/PolaroidTable/index', async () => ({
  default: (await import('../../worlds/_placeholder/PlaceholderLayout')).PlaceholderLayout,
}))

// The real viewer is covered in components/Lightbox; here it only reports which slide it shows.
vi.mock('../../components/Lightbox/LightboxImpl', async () => {
  const { useEffect } = await import('react')
  return {
    default: function FakeViewer({ index, onView }: { index: number; onView?: (i: number) => void }) {
      useEffect(() => {
        onView?.(index)
      }, [index, onView])
      return <p>viewer at {index}</p>
    },
  }
})

const progress = () => JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? '{}') as Record<string, number>
const frameOf = (container: HTMLElement) => container.querySelector('section') as HTMLElement

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
})
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false
})
beforeEach(() => {
  localStorage.clear()
  installDomStubs()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  resetServerClock()
})

describe('WorldRoute shell states', () => {
  it('shows a loading state inside the world frame, without redirecting', () => {
    stubFetch(() => new Promise<Response>(() => {}))
    renderWorldAt('/world/our-firsts')
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.queryByText('launcher')).toBeNull()
    expect(screen.getByRole('link', { name: 'All chapters' }).getAttribute('href')).toBe('/')
  })

  it('offers a retry on a server error (no redirect) and recovers', async () => {
    stubFetch((_p, n) => (n === 1 ? problem(500) : json(openWorld())))
    renderWorldAt('/world/our-firsts')
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Our Firsts' })).toBeTruthy()
    expect(screen.queryByText('launcher')).toBeNull()
  })

  it('goes back home for an unknown world, and for a malformed slug without asking the server', async () => {
    const calls = stubFetch(() => problem(404))
    renderWorldAt('/world/nope')
    expect(await screen.findByText('launcher')).toBeTruthy()
    cleanup()
    calls.length = 0
    renderWorldAt('/world/Not_A_Slug')
    expect(screen.getByText('launcher')).toBeTruthy()
    expect(calls).toEqual([])
  })

  it('applies a valid themeAccent as --world-accent and ignores an invalid one', async () => {
    stubFetch(() => json(openWorld()))
    const first = renderWorldAt('/world/our-firsts')
    await screen.findByRole('heading', { name: 'Our Firsts' })
    expect(frameOf(first.container).style.getPropertyValue('--world-accent')).toBe('#d6304f')
    cleanup()
    stubFetch(() => json(openWorld({ themeAccent: 'red;}' })))
    const second = renderWorldAt('/world/our-firsts')
    await screen.findByRole('heading', { name: 'Our Firsts' })
    expect(frameOf(second.container).style.getPropertyValue('--world-accent')).toBe('')
  })
})

describe('open world flow', () => {
  it('intro -> layout -> lightbox -> outro -> next chapter, writing progress on the way', async () => {
    const calls = stubFetch((path) => (path === '/api/worlds/our-firsts' ? json(openWorld()) : json(lockedWorld())))
    renderWorldAt('/world/our-firsts')

    expect(await screen.findByText('It started with coffee.')).toBeTruthy()
    expect(progress()).toEqual({})
    fireEvent.click(screen.getByRole('button', { name: 'Skip intro' }))

    const photos = await screen.findAllByRole('button', { name: /^Open Moment/ })
    expect(photos).toHaveLength(4)
    expect(progress()).toEqual({ 'our-firsts': 0.05 })

    fireEvent.click(photos[1]!)
    expect(await screen.findByText('viewer at 1')).toBeTruthy()
    expect(progress()['our-firsts']).toBeCloseTo(0.475)

    expect(screen.queryByText('And then there were more.')).toBeNull()
    expect(calls).not.toContain('/api/worlds/our-forever')
    showAll() // the end of the layout comes into view
    expect(await screen.findByText('And then there were more.')).toBeTruthy()
    expect(progress()).toEqual({ 'our-firsts': 1 })

    showAll() // the outro comes into view: the next world is prefetched and shown as a locked teaser
    await waitFor(() => expect(calls).toContain('/api/worlds/our-forever'))
    const next = await screen.findByRole('link', { name: /Next chapter/ })
    await waitFor(() => expect(next.textContent).toContain('Our Forever'))
    expect(next.getAttribute('href')).toBe('/world/our-forever')
    expect(next.hasAttribute('data-locked')).toBe(true)
    expect(screen.getByRole('timer').textContent).toMatch(/^Opens in/)
  })

  it('shows the end of the story when there is no next world', async () => {
    stubFetch(() => json(openWorld({ nextSlug: null })))
    renderWorldAt('/world/our-firsts')
    fireEvent.click(await screen.findByRole('button', { name: 'Skip intro' }))
    await screen.findAllByRole('button', { name: /^Open Moment/ })
    showAll()
    expect(await screen.findByText('That is every chapter, for now.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Next chapter/ })).toBeNull()
  })

  it('still works when storage refuses writes', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    stubFetch(() => json(openWorld({ nextSlug: null })))
    renderWorldAt('/world/our-firsts')
    fireEvent.click(await screen.findByRole('button', { name: 'Skip intro' }))
    expect(await screen.findAllByRole('button', { name: /^Open Moment/ })).toHaveLength(4)
    showAll()
    expect(await screen.findByText('And then there were more.')).toBeTruthy()
  })
})
