// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useCountdown } from './useCountdown'

const T0 = new Date('2026-10-01T00:00:00.000Z')
const TARGET = '2026-10-01T00:01:00.000Z'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
})
afterEach(() => vi.useRealTimers())

describe('useCountdown', () => {
  it('ticks every second while running', () => {
    const { result } = renderHook(() => useCountdown(TARGET))
    expect(result.current.seconds).toBe(0)
    expect(result.current.minutes).toBe(1)
    act(() => vi.advanceTimersByTime(3000))
    expect(result.current.seconds).toBe(57)
  })

  it('sets no interval while paused and catches up when it runs again', () => {
    const setInterval = vi.spyOn(window, 'setInterval')
    const { result, rerender } = renderHook(({ running }) => useCountdown(TARGET, running), { initialProps: { running: false } })
    act(() => vi.advanceTimersByTime(5000))
    expect(setInterval).not.toHaveBeenCalled()
    expect(result.current.minutes).toBe(1)
    rerender({ running: true })
    act(() => vi.advanceTimersByTime(0)) // the catch-up tick fires on the next macrotask, before any 1s tick
    expect(result.current.seconds).toBe(55)
    expect(setInterval).toHaveBeenCalledTimes(1)
  })

  it('stops ticking when paused', () => {
    const { result, rerender } = renderHook(({ running }) => useCountdown(TARGET, running), { initialProps: { running: true } })
    act(() => vi.advanceTimersByTime(2000))
    rerender({ running: false })
    act(() => vi.advanceTimersByTime(10_000))
    expect(result.current.seconds).toBe(58)
    expect(vi.getTimerCount()).toBe(0)
  })
})
