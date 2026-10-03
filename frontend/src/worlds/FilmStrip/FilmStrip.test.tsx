// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LazyMotion, domMax } from 'motion/react'
import { installDomStubs, moment, openWorld, showAll } from '../../features/world/test-support'
import type { Moment } from '../../types/api'
import FilmStrip from './index'

function renderStrip(moments: Moment[]) {
  const onFinished = vi.fn()
  const onOpenPhoto = vi.fn()
  const view = render(
    <LazyMotion features={domMax} strict>
      <FilmStrip world={openWorld({ layout: 'FILM_STRIP', moments })} onFinished={onFinished} onOpenPhoto={onOpenPhoto} />
    </LazyMotion>,
  )
  return { ...view, onFinished, onOpenPhoto }
}

beforeEach(() => installDomStubs())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('FilmStrip', () => {
  it('opens the photo of the frame that was pressed', () => {
    const { onOpenPhoto } = renderStrip([moment(1), moment(2), moment(3)])
    fireEvent.click(screen.getByRole('button', { name: 'Open Moment 2' }))
    expect(onOpenPhoto).toHaveBeenCalledWith(1)
  })

  it('finishes once the end of the roll is in view', async () => {
    const { onFinished } = renderStrip([moment(1), moment(2)])
    expect(onFinished).not.toHaveBeenCalled()
    await waitFor(() => {
      showAll()
      expect(onFinished).toHaveBeenCalledTimes(1)
    })
  })

  it('shows date stamps, frame numbers and a frame counter', () => {
    const dated = { ...moment(1), happenedOn: '2019-03-02' }
    const { container } = renderStrip([dated, moment(2)])
    expect(screen.getByText("'19 03 02")).toBeTruthy()
    expect(screen.getByText('01A')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Previous frame' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Next frame' })).toHaveProperty('disabled', false)
    expect(container.querySelector('[aria-live]')?.textContent).toContain('01')
  })

  it('works with a single moment', () => {
    const { onOpenPhoto } = renderStrip([moment(7)])
    fireEvent.click(screen.getByRole('button', { name: 'Open Moment 7' }))
    expect(onOpenPhoto).toHaveBeenCalledWith(0)
    expect(screen.getByRole('button', { name: 'Next frame' })).toHaveProperty('disabled', true)
  })

  it('finishes at once and shows a gentle note when there are no moments', () => {
    const { onFinished } = renderStrip([])
    expect(onFinished).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/still waiting to be developed/)).toBeTruthy()
  })

  it('falls back to a plain strip without the light leak under reduced motion', () => {
    preferReducedMotion()
    const { container } = renderStrip([moment(1), moment(2)])
    expect(container.querySelector('section')?.hasAttribute('data-reduced')).toBe(true)
    expect(screen.getByText(/Swipe the strip/)).toBeTruthy()
  })

  it('under reduced motion, stepping to the last frame with Next finishes the roll', () => {
    preferReducedMotion()
    const { container, onFinished } = renderStrip([moment(1), moment(2), moment(3)])
    const next = screen.getByRole('button', { name: 'Next frame' })
    fireEvent.click(next)
    expect(onFinished).not.toHaveBeenCalled()
    fireEvent.click(next)
    expect(container.querySelector('[aria-live]')?.textContent).toContain('03')
    expect(next).toHaveProperty('disabled', true)
    expect(onFinished).toHaveBeenCalledTimes(1)
  })

  it('finishes only once when the last frame and the end of the roll both arrive', () => {
    preferReducedMotion()
    const { onFinished } = renderStrip([moment(1), moment(2)])
    fireEvent.click(screen.getByRole('button', { name: 'Next frame' }))
    showAll()
    expect(onFinished).toHaveBeenCalledTimes(1)
  })
})

function preferReducedMotion() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('reduce'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}
