// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LazyMotion, domMax } from 'motion/react'
import type { Moment, OpenWorldDetail } from '../../types/api'
import Postcards from './index'

const moment = (i: number): Moment => ({
  id: `m${i}`,
  sortOrder: i,
  caption: `Trip ${i}`,
  note: i === 1 ? 'The ferry was late' : null,
  happenedOn: '2021-07-14',
  place: 'Goa',
  favourite: false,
  media: { mediaId: `MEDIA${i}`, mimeType: 'image/jpeg', width: 1200, height: 800, lqip: null, dominantColor: null, takenAt: null },
})

const world = (n: number) => ({ slug: 'w', layout: 'POSTCARDS', moments: Array.from({ length: n }, (_, i) => moment(i + 1)) }) as OpenWorldDetail

function setup(n: number) {
  const onFinished = vi.fn()
  const onOpenPhoto = vi.fn()
  render(
    <LazyMotion features={domMax} strict>
      <Postcards world={world(n)} onFinished={onFinished} onOpenPhoto={onOpenPhoto} />
    </LazyMotion>,
  )
  return { onFinished, onOpenPhoto }
}

const counter = () => document.querySelector('[aria-live="polite"]')?.textContent
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Send it off, next postcard' }))

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
})

afterEach(cleanup)

describe('Postcards', () => {
  it('turns the top card over with the button, a tap and Enter-click', () => {
    setup(3)
    const card = screen.getByRole('button', { name: 'Postcard: Trip 1. Turn over' })
    expect(card.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('The ferry was late')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Turn over' }))
    expect(card.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(card)
    expect(card.getAttribute('aria-pressed')).toBe('false')
  })

  it('sends cards away by button, counts them, and finishes after the last', async () => {
    const { onFinished } = setup(2)
    expect(counter()).toBe('Postcard 1 /  of 2')
    next()
    expect(counter()).toBe('Postcard 2 /  of 2')
    expect(onFinished).not.toHaveBeenCalled()
    next()
    expect(onFinished).toHaveBeenCalledTimes(1)
    expect(screen.getByText("That's every postcard.")).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Postcard: / })).toBeNull())
  })

  it('goes back with the previous button and the arrow keys', () => {
    setup(3)
    const prev = screen.getByRole('button', { name: 'Previous postcard' }) as HTMLButtonElement
    expect(prev.disabled).toBe(true)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Postcard: Trip 1. Turn over' }), { key: 'ArrowRight' })
    expect(counter()).toBe('Postcard 2 /  of 3')
    fireEvent.click(prev)
    expect(counter()).toBe('Postcard 1 /  of 3')
  })

  it('shuffles the deck back after the end', async () => {
    setup(1)
    next()
    fireEvent.click(screen.getByRole('button', { name: 'Shuffle back' }))
    expect(counter()).toBe('Postcard 1 /  of 1')
    expect(await screen.findByRole('button', { name: 'Postcard: Trip 1. Turn over' })).toBeTruthy()
  })

  it('opens the top photo with View photo and with O', () => {
    const { onOpenPhoto } = setup(3)
    next()
    fireEvent.click(screen.getByRole('button', { name: 'Open Trip 2' }))
    expect(onOpenPhoto).toHaveBeenLastCalledWith(1)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Postcard: Trip 2. Turn over' }), { key: 'o' })
    expect(onOpenPhoto).toHaveBeenCalledTimes(2)
  })

  it('shows a gentle empty state and finishes when there are no moments', () => {
    const { onFinished } = setup(0)
    expect(screen.getByText(/No postcards yet/)).toBeTruthy()
    expect(onFinished).toHaveBeenCalled()
  })
})
