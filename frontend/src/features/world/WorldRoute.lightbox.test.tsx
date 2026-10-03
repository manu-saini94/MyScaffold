// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import { resetServerClock } from '../../services/serverClock'
import { installDomStubs, json, openWorld, renderWorldAt, stubFetch } from './test-support'

// The shell's placeholder grid stands in for the layout; the lightbox is the REAL yarl viewer (no mock).
vi.mock('../../worlds/PolaroidTable/index', async () => ({
  default: (await import('../../worlds/_placeholder/PlaceholderLayout')).PlaceholderLayout,
}))

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

describe('world frame with the real lightbox', () => {
  it('Escape closes the viewer and keeps the world open', async () => {
    stubFetch(() => json(openWorld({ nextSlug: null })))
    renderWorldAt('/world/our-firsts')
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    const photos = await screen.findAllByRole('button', { name: /^Open Moment/ })
    fireEvent.click(photos[1]!)

    const viewer = await screen.findByRole('dialog', { name: 'Lightbox' }, { timeout: 5000 })
    expect(viewer.getAttribute('aria-modal')).toBe('true')

    fireEvent.keyDown(document.activeElement && viewer.contains(document.activeElement) ? document.activeElement : viewer, {
      key: 'Escape',
    })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Lightbox' })).toBeNull())
    expect(screen.queryByText('launcher')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Our Firsts' })).toBeTruthy()
  })
})
