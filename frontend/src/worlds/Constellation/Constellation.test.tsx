// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LazyMotion, domMax } from 'motion/react'
import { moment, openWorld } from '../../features/world/test-support'
import type { OpenWorldDetail } from '../types'
import Constellation, { FINAL_LINE, FINISH_MS } from './index'

function setup(world: OpenWorldDetail) {
  const onFinished = vi.fn()
  const onOpenPhoto = vi.fn()
  render(
    <LazyMotion features={domMax} strict>
      <Constellation world={world} onFinished={onFinished} onOpenPhoto={onOpenPhoto} />
    </LazyMotion>,
  )
  return { onFinished, onOpenPhoto }
}

const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))
const stars = () => screen.getAllByRole('button', { name: /^Star \d/ })
const star = (i: number) => {
  const el = stars()[i]
  if (!el) throw new Error(`no star ${i}`)
  return el
}

beforeEach(() => {
  vi.useFakeTimers()
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null)
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

describe('Constellation', () => {
  it('discovers every star in any order, shows each photo, then glows and finishes', async () => {
    const { onFinished, onOpenPhoto } = setup(openWorld({ layout: 'CONSTELLATION', moments: [moment(1), moment(2), moment(3)] }))

    expect(stars().map((b) => b.getAttribute('aria-label'))).toEqual(['Star 1 of 3', 'Star 2 of 3', 'Star 3 of 3'])
    expect(star(0).hasAttribute('data-hint')).toBe(true)
    expect(screen.getByText('Touch a star to find a memory')).toBeTruthy()

    fireEvent.click(star(2))
    await tick(700)
    expect(star(2).getAttribute('aria-label')).toBe('Star 3 of 3: Moment 3 (found)')
    expect(star(0).hasAttribute('data-hint')).toBe(true) // wraps round to the first dark star
    fireEvent.click(screen.getByRole('button', { name: 'Open Moment 3' }))
    expect(onOpenPhoto).toHaveBeenCalledWith(2)

    fireEvent.click(star(0))
    await tick(700)
    expect(screen.getAllByText('2 of 3 stars found').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Open Moment 1' })).toBeTruthy()
    expect(screen.queryByText(FINAL_LINE)).toBeNull()

    fireEvent.click(star(1))
    await tick(100)
    expect(screen.getByText(FINAL_LINE)).toBeTruthy()
    expect(onFinished).not.toHaveBeenCalled()
    await tick(FINISH_MS)
    expect(onFinished).toHaveBeenCalledTimes(1)
  })

  it('finishes at once with a quiet sky when there are no moments', () => {
    const { onFinished } = setup(openWorld({ layout: 'CONSTELLATION', moments: [] }))
    expect(onFinished).toHaveBeenCalled()
    expect(screen.getByText('The sky is still waiting for its stars.')).toBeTruthy()
  })

  it('a single moment is one star that completes the heart', async () => {
    const { onFinished } = setup(openWorld({ layout: 'CONSTELLATION', moments: [moment(1)] }))
    fireEvent.click(star(0))
    await tick(FINISH_MS + 100)
    expect(onFinished).toHaveBeenCalledTimes(1)
  })
})
