// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LazyMotion, domMax } from 'motion/react'
import type { Moment, OpenWorldDetail } from '../../types/api'
import PolaroidTable from './index'

const moment = (i: number): Moment => ({
  id: `m${i}`,
  sortOrder: i,
  caption: `Moment ${i}`,
  note: i === 1 ? 'You spilled the coffee' : null,
  happenedOn: '2019-03-02',
  place: 'Pune',
  favourite: false,
  media: { mediaId: `MEDIA${i}`, mimeType: 'image/jpeg', width: 1200, height: 900, lqip: null, dominantColor: null, takenAt: null },
})

const world = (n: number) => ({ slug: 'w', layout: 'POLAROID_TABLE', moments: Array.from({ length: n }, (_, i) => moment(i + 1)) }) as OpenWorldDetail

function setup(n: number) {
  const onFinished = vi.fn()
  const onOpenPhoto = vi.fn()
  render(
    <LazyMotion features={domMax} strict>
      <PolaroidTable world={world(n)} onFinished={onFinished} onOpenPhoto={onOpenPhoto} />
    </LazyMotion>,
  )
  return { onFinished, onOpenPhoto }
}

const card = (i: number) => screen.getByRole('button', { name: `Moment ${i}. Turn over` })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
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

describe('PolaroidTable', () => {
  it('turns a card over on tap and on Enter, showing the handwritten back', () => {
    setup(3)
    expect(card(1).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('You spilled the coffee')).toBeTruthy()
    expect(screen.getAllByText('Pune · 2 March 2019').length).toBeGreaterThan(0)
    fireEvent.click(card(1))
    expect(card(1).getAttribute('aria-pressed')).toBe('true')
    vi.advanceTimersByTime(1000)
    fireEvent.click(card(1))
    expect(card(1).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('Turned over 1 of 3')).toBeTruthy()
  })

  it('opens the photo with O, the lens button and a double-tap', () => {
    const { onOpenPhoto } = setup(3)
    fireEvent.keyDown(card(2), { key: 'o' })
    expect(onOpenPhoto).toHaveBeenLastCalledWith(1)
    fireEvent.click(screen.getByRole('button', { name: 'Open Moment 3' }))
    expect(onOpenPhoto).toHaveBeenLastCalledWith(2)
    fireEvent.click(card(1))
    fireEvent.click(card(1))
    expect(onOpenPhoto).toHaveBeenLastCalledWith(0)
    expect(card(1).getAttribute('aria-pressed')).toBe('false')
  })

  it('finishes once every card has been turned over', () => {
    const { onFinished } = setup(2)
    fireEvent.click(card(1))
    expect(onFinished).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    fireEvent.click(card(2))
    expect(onFinished).toHaveBeenCalled()
    expect(screen.getByText('Every one of them, turned over.')).toBeTruthy()
  })

  it('finishes from the "That\'s all of them" button', () => {
    const { onFinished } = setup(1)
    fireEvent.click(screen.getByRole('button', { name: "That's all of them" }))
    expect(onFinished).toHaveBeenCalledTimes(1)
  })

  it('shows a gentle empty table and finishes when there are no moments', () => {
    const { onFinished } = setup(0)
    expect(screen.getByText(/The table is bare/)).toBeTruthy()
    expect(onFinished).toHaveBeenCalled()
  })
})
