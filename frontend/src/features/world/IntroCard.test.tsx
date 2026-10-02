// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { OpenWorldDetail } from '../../types/api'
import { INTRO_MS, IntroCard } from './IntroCard'

const world = {
  slug: 'our-firsts',
  title: 'Our Firsts',
  subtitle: 'Chapter two',
  tagline: 'Every first time',
  introText: 'It started with coffee.',
} as OpenWorldDetail

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('IntroCard', () => {
  it('shows the title card text and continues by itself after INTRO_MS', () => {
    vi.useFakeTimers()
    const onDone = vi.fn()
    render(<IntroCard world={world} onDone={onDone} />)
    expect(screen.getByRole('heading', { name: 'Our Firsts' })).toBeTruthy()
    expect(screen.getByText('Every first time')).toBeTruthy()
    expect(screen.getByText('It started with coffee.')).toBeTruthy()
    act(() => vi.advanceTimersByTime(INTRO_MS - 1))
    expect(onDone).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('continues on a tap anywhere and on Skip', () => {
    const onDone = vi.fn()
    render(<IntroCard world={world} onDone={onDone} />)
    fireEvent.click(screen.getByText('It started with coffee.'))
    fireEvent.click(screen.getByRole('button', { name: 'Skip intro' }))
    expect(onDone).toHaveBeenCalledTimes(2)
  })
})
