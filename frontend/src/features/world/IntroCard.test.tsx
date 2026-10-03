// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { OpenWorldDetail } from '../../types/api'
import { INTRO_MAX_MS, INTRO_MIN_MS, INTRO_MS_PER_CHAR, IntroCard, introAutoAdvanceMs } from './IntroCard'

const world = {
  slug: 'our-firsts',
  title: 'Our Firsts',
  subtitle: 'Chapter two',
  tagline: 'Every first time',
  introText: 'It started with coffee.',
} as OpenWorldDetail
const titleOnly = { ...world, introText: null } as OpenWorldDetail
const titleOnlyMs = INTRO_MIN_MS + ('Our Firsts' + 'Chapter two' + 'Every first time').length * INTRO_MS_PER_CHAR

let reduced = false
beforeEach(() => {
  reduced = false
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduced && query.includes('reduce'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('introAutoAdvanceMs', () => {
  it('waits for the visitor when there is intro text or reduced motion', () => {
    expect(introAutoAdvanceMs(world, false)).toBeNull()
    expect(introAutoAdvanceMs({ ...world, introText: 'x'.repeat(2000) }, false)).toBeNull()
    expect(introAutoAdvanceMs(titleOnly, true)).toBeNull()
  })

  it('scales a title-only card with its text, within bounds', () => {
    expect(introAutoAdvanceMs(titleOnly, false)).toBe(titleOnlyMs)
    expect(introAutoAdvanceMs({ ...titleOnly, title: 'A', subtitle: null, tagline: null }, false)).toBe(INTRO_MIN_MS + INTRO_MS_PER_CHAR)
    expect(introAutoAdvanceMs({ ...titleOnly, title: 'x'.repeat(500) }, false)).toBe(INTRO_MAX_MS)
    expect(introAutoAdvanceMs({ ...titleOnly, introText: '   ' }, false)).toBe(titleOnlyMs)
  })
})

describe('IntroCard', () => {
  it('never moves on by itself while there is intro text to read', () => {
    vi.useFakeTimers()
    const onDone = vi.fn()
    render(<IntroCard world={world} onDone={onDone} />)
    expect(screen.getByRole('heading', { name: 'Our Firsts' })).toBeTruthy()
    expect(screen.getByText('Every first time')).toBeTruthy()
    expect(screen.getByText('It started with coffee.')).toBeTruthy()
    act(() => vi.advanceTimersByTime(60_000))
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
  })

  it('moves a title-only card on after its scaled time', () => {
    vi.useFakeTimers()
    const onDone = vi.fn()
    render(<IntroCard world={titleOnly} onDone={onDone} />)
    act(() => vi.advanceTimersByTime(titleOnlyMs - 1))
    expect(onDone).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Skip intro' })).toBeTruthy()
  })

  it('under reduced motion waits even for a title-only card', () => {
    reduced = true
    vi.useFakeTimers()
    const onDone = vi.fn()
    render(<IntroCard world={titleOnly} onDone={onDone} />)
    act(() => vi.advanceTimersByTime(60_000))
    expect(onDone).not.toHaveBeenCalled()
  })

  it('continues on a tap anywhere, on the button, and on Enter', () => {
    const onDone = vi.fn()
    render(<IntroCard world={world} onDone={onDone} />)
    fireEvent.click(screen.getByText('It started with coffee.'))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.keyDown(document.body, { key: 'Enter' })
    expect(onDone).toHaveBeenCalledTimes(3)
    // Enter on the focused button is the button's own click, not a second continue
    fireEvent.keyDown(screen.getByRole('button', { name: 'Continue' }), { key: 'Enter' })
    expect(onDone).toHaveBeenCalledTimes(3)
  })
})
