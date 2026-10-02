// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { ClickEffects } from './ClickEffects'
import { burstFor } from './clickEngine'

let reduced = false
const frames: FrameRequestCallback[] = []

beforeEach(() => {
  reduced = false
  frames.length = 0
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduced,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  const fakeCtx = new Proxy({}, { get: () => vi.fn() })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeCtx as CanvasRenderingContext2D)
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const canvas = () => document.querySelector('canvas[data-click-effects]')

describe('burstFor', () => {
  it('plays hearts by default, sparkle or nothing when a region asks', () => {
    document.body.innerHTML = `
      <p id="plain">x</p>
      <div data-click-effect="sparkle"><span id="title">t</span></div>
      <div data-click-effect="none"><button id="quiet">q</button></div>`
    expect(burstFor(document.getElementById('plain'))).toBe('hearts')
    expect(burstFor(document.getElementById('title'))).toBe('sparkle')
    expect(burstFor(document.getElementById('quiet'))).toBeNull()
    expect(burstFor(null)).toBe('hearts')
    document.body.innerHTML = ''
  })
})

describe('<ClickEffects />', () => {
  it('creates one pointer-transparent canvas on the first tap and removes it on unmount', () => {
    const { unmount } = render(<ClickEffects />)
    expect(canvas()).toBeNull() // nothing until someone taps
    fireEvent.pointerDown(document.body, { clientX: 10, clientY: 20, pointerType: 'touch' })
    const el = canvas() as HTMLCanvasElement
    expect(el).toBeTruthy()
    expect(el.style.pointerEvents).toBe('none')
    expect(el.getAttribute('aria-hidden')).toBe('true')
    expect(frames).toHaveLength(1)
    fireEvent.pointerDown(document.body, { clientX: 30, clientY: 40, pointerType: 'touch' })
    expect(document.querySelectorAll('canvas[data-click-effects]')).toHaveLength(1)
    expect(frames).toHaveLength(1) // the running loop is reused
    unmount()
    expect(canvas()).toBeNull()
  })

  it('ignores secondary mouse buttons', () => {
    render(<ClickEffects />)
    fireEvent.pointerDown(document.body, { button: 2, pointerType: 'mouse' })
    expect(canvas()).toBeNull()
  })

  it('stays off under reduced motion', () => {
    reduced = true
    render(<ClickEffects />)
    fireEvent.pointerDown(document.body, { clientX: 1, clientY: 1, pointerType: 'touch' })
    expect(canvas()).toBeNull()
  })
})
