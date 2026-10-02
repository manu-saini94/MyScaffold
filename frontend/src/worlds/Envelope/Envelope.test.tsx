// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LazyMotion, domMax } from 'motion/react'
import { moment, openWorld } from '../../features/world/test-support'
import type { OpenWorldDetail } from '../types'
import Envelope from './index'
import { TIMING } from './unfold'

const confetti = vi.hoisted(() => Object.assign(vi.fn(() => null), { shapeFromPath: vi.fn(() => ({ type: 'path' })) }))
vi.mock('canvas-confetti', () => ({ default: confetti }))

function setup(world: OpenWorldDetail) {
  const onFinished = vi.fn()
  const onOpenPhoto = vi.fn()
  render(
    <LazyMotion features={domMax} strict>
      <Envelope world={world} onFinished={onFinished} onOpenPhoto={onOpenPhoto} />
    </LazyMotion>,
  )
  return { onFinished, onOpenPhoto }
}

const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

beforeEach(() => {
  vi.useFakeTimers()
  confetti.mockClear()
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Envelope', () => {
  it('breaks the seal, shows the letter, unfolds every photo with a burst on the key one, then finishes', async () => {
    const moments = [moment(1), { ...moment(2), favourite: true }, moment(3)]
    const { onFinished, onOpenPhoto } = setup(openWorld({ layout: 'ENVELOPE', tagline: 'Will you?', moments }))

    expect(screen.queryByRole('button', { name: /Open Moment/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Break the seal/ }))
    expect(screen.queryByRole('button', { name: /Break the seal/ })).toBeNull()

    await tick(TIMING.openMs)
    const openPhotos = screen.getByRole('button', { name: 'Open the photos' })
    expect(document.activeElement).toBe(openPhotos)
    expect(screen.getByText('Will you?')).toBeTruthy()
    expect(screen.getByText('3 photos inside')).toBeTruthy()

    fireEvent.click(openPhotos)
    await tick(800)
    expect(screen.getByRole('button', { name: 'Open Moment 1' })).toBeTruthy()
    expect(screen.getByText('1 / 3')).toBeTruthy()
    expect(confetti).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await tick(1200)
    expect(screen.getByText('2 / 3')).toBeTruthy()
    expect(confetti).toHaveBeenCalled()
    expect(confetti.shapeFromPath).toHaveBeenCalled()

    // tapping the photo opens the lightbox and pauses the sequence
    fireEvent.click(screen.getByRole('button', { name: 'Open Moment 2' }))
    expect(onOpenPhoto).toHaveBeenCalledWith(1)
    await tick(TIMING.photoMs * 2)
    expect(screen.getByText('2 / 3')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    await tick(TIMING.photoMs)
    expect(screen.getByText('3 / 3')).toBeTruthy()
    expect(onFinished).not.toHaveBeenCalled()

    await tick(TIMING.endMs)
    expect(onFinished).toHaveBeenCalled()
    expect(screen.getAllByRole('button', { name: /^Open photo \d/ })).toHaveLength(3)
  })

  it('finishes at once with a gentle note when there are no photos', () => {
    const { onFinished } = setup(openWorld({ layout: 'ENVELOPE', moments: [] }))
    expect(onFinished).toHaveBeenCalled()
    expect(screen.getByText('This letter is still being written.')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
