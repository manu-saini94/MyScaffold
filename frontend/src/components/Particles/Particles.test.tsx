// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { Particles } from './Particles'

let raf: ReturnType<typeof vi.fn>
let caf: ReturnType<typeof vi.fn>

beforeEach(() => {
  let id = 0
  raf = vi.fn(() => ++id)
  caf = vi.fn()
  vi.stubGlobal('requestAnimationFrame', raf)
  vi.stubGlobal('cancelAnimationFrame', caf)
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  // jsdom has no 2D canvas; the loop only needs setTransform before the first frame
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ setTransform: vi.fn() } as unknown as CanvasRenderingContext2D)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Particles', () => {
  it('runs no frame loop while paused and starts it when unpaused', () => {
    const { rerender } = render(<Particles kind="petals" paused />)
    expect(raf).not.toHaveBeenCalled()
    rerender(<Particles kind="petals" paused={false} />)
    expect(raf).toHaveBeenCalledTimes(1)
  })

  it('cancels the running frame when paused', () => {
    const { rerender } = render(<Particles kind="petals" />)
    expect(raf).toHaveBeenCalledTimes(1)
    const running = raf.mock.results[0]!.value as number
    rerender(<Particles kind="petals" paused />)
    expect(caf).toHaveBeenCalledWith(running)
    expect(raf).toHaveBeenCalledTimes(1)
  })
})
