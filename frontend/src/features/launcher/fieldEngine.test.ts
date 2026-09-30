import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FieldEngine } from './fieldEngine'
import { CENTER_SCALE } from './fisheye'
import { buildCells } from './hexLayout'

// ---- fake browser: fake clock + rAF driven by it (no DOM needed) -------------------------------

const CELLS = buildCells(1, 100) // 0 = centre, 1..5 = real worlds, 6 = ghost at (-100, 0)
const SNAP = [0, 1, 2, 3, 4, 5]

interface Harness {
  engine: FieldEngine
  centre: ReturnType<typeof vi.fn>
  els: HTMLElement[]
}

function makeEngine(reducedMotion = false, snap = SNAP): Harness {
  const centre = vi.fn()
  const engine = new FieldEngine({ reducedMotion, onCenterChange: centre })
  const els = CELLS.map(() => ({ style: {} }) as unknown as HTMLElement)
  els.forEach((el, i) => engine.register(i, el))
  engine.setLayout(CELLS, snap, 300)
  return { engine, centre, els }
}

let pointerT = 0
function ptr(x: number, y: number, t: number, extra: Partial<PointerEvent> = {}): PointerEvent {
  pointerT = t
  return { pointerId: 1, pointerType: 'touch', button: 0, clientX: x, clientY: y, timeStamp: t, ...extra } as PointerEvent
}

/** Pan of cell 0 (which sits at 0,0) equals the engine's pan offset. */
function pan(el: HTMLElement): { x: number; y: number } {
  const m = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(el.style.transform)
  return { x: Number(m?.[1]), y: Number(m?.[2]) }
}

const settle = () => vi.advanceTimersByTime(3000)

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('window', globalThis)
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 16),
  )
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('FieldEngine layout + render', () => {
  it('draws the centre cell at full scale and reports it as the centre', () => {
    const { els, centre } = makeEngine()
    expect(els[0]!.style.transform).toBe(`translate3d(0.00px, 0.00px, 0) scale(${CENTER_SCALE.toFixed(4)})`)
    expect(els[0]!.style.opacity).toBe('1.000')
    expect(centre).toHaveBeenCalledTimes(1)
    expect(centre).toHaveBeenLastCalledWith(0)
  })

  it('scales outer cells down and offsets them by their hex position', () => {
    const { els } = makeEngine()
    expect(els[3]!.style.transform).toMatch(/^translate3d\(100\.00px, 0\.00px, 0\) scale\(/)
    const scale = Number(/scale\(([\d.]+)\)/.exec(els[3]!.style.transform)![1])
    expect(scale).toBeLessThan(CENTER_SCALE)
  })

  it('does not throw for cells whose element has been unregistered', () => {
    const { engine } = makeEngine()
    engine.register(2, null)
    expect(() => engine.render()).not.toThrow()
  })
})

describe('FieldEngine drag', () => {
  it('treats sub-threshold movement as a tap, not a drag', () => {
    const { engine, els } = makeEngine()
    engine.pointerDown(ptr(200, 200, 0))
    expect(engine.pointerMove(ptr(203, 202, 10))).toBe(false)
    engine.pointerUp(ptr(203, 202, 20))
    expect(engine.wasDrag).toBe(false)
    expect(pan(els[0]!)).toEqual({ x: 0, y: 0 })
    expect(vi.getTimerCount()).toBe(0) // nothing to settle
  })

  it('reports the threshold crossing exactly once, so the caller captures the pointer once', () => {
    const { engine } = makeEngine()
    engine.pointerDown(ptr(200, 200, 0))
    expect(engine.pointerMove(ptr(215, 200, 10))).toBe(true)
    expect(engine.pointerMove(ptr(230, 200, 20))).toBe(false)
    expect(engine.wasDrag).toBe(true)
  })

  it('pans the field with the finger', () => {
    const { engine, els } = makeEngine()
    engine.pointerDown(ptr(200, 200, 0))
    engine.pointerMove(ptr(215, 200, 10))
    engine.pointerMove(ptr(240, 210, 20))
    expect(pan(els[0]!)).toEqual({ x: 40, y: 10 })
  })

  it('ignores other pointers and the right mouse button', () => {
    const { engine, els } = makeEngine()
    engine.pointerDown(ptr(200, 200, 0, { pointerType: 'mouse', button: 2 }))
    expect(engine.pointerMove(ptr(260, 200, 10))).toBe(false)
    engine.pointerDown(ptr(200, 200, 20))
    expect(engine.pointerMove(ptr(260, 200, 30, { pointerId: 9 }))).toBe(false)
    engine.pointerUp(ptr(260, 200, 40, { pointerId: 9 }))
    expect(pan(els[0]!)).toEqual({ x: 0, y: 0 })
  })

  it('rubber-bands once dragged past the outermost cell', () => {
    const { engine, els } = makeEngine()
    engine.pointerDown(ptr(0, 0, 0))
    for (let i = 1; i <= 10; i++) engine.pointerMove(ptr(i * 50, 0, i * 10))
    const x = pan(els[0]!).x
    expect(x).toBeGreaterThan(100) // went past the edge (limit = 100)
    expect(x).toBeLessThan(500 * 0.6) // but far less than the finger travelled
  })
})

describe('FieldEngine release: snap + inertia', () => {
  function drag(engine: FieldEngine, dx: number, steps: number, gapMs: number, releaseAfterMs: number) {
    engine.pointerDown(ptr(300, 300, 0))
    for (let i = 1; i <= steps; i++) engine.pointerMove(ptr(300 + (dx * i) / steps, 300, i * gapMs))
    engine.pointerUp(ptr(300 + dx, 300, steps * gapMs + releaseAfterMs))
  }

  it('snaps to the nearest real icon after a slow drag and settles the loop', () => {
    const { engine, els, centre } = makeEngine()
    drag(engine, -100, 10, 40, 250) // paused before release: no flick
    settle()
    expect(pan(els[0]!)).toEqual({ x: -100, y: 0 }) // cell 3 (x=100) now sits in the middle
    expect(centre).toHaveBeenLastCalledWith(3)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('a pause before release kills the flick: a short drag springs back', () => {
    const { engine, els, centre } = makeEngine()
    drag(engine, -30, 2, 8, 200)
    settle()
    expect(pan(els[0]!)).toEqual({ x: 0, y: 0 })
    expect(centre).toHaveBeenLastCalledWith(0)
  })

  it('the same short drag released mid-flick carries on to the next icon', () => {
    const { engine, els, centre } = makeEngine()
    drag(engine, -30, 2, 8, 4)
    settle()
    expect(pan(els[0]!)).toEqual({ x: -100, y: 0 })
    expect(centre).toHaveBeenLastCalledWith(3)
  })

  it('reduced motion drops inertia: the same flick springs back', () => {
    const { engine, els } = makeEngine(true)
    drag(engine, -30, 2, 8, 4)
    settle()
    expect(pan(els[0]!)).toEqual({ x: 0, y: 0 })
  })

  it('setOptions switches reduced motion on the fly', () => {
    const { engine, els } = makeEngine(false)
    engine.setOptions(true)
    drag(engine, -30, 2, 8, 4)
    settle()
    expect(pan(els[0]!)).toEqual({ x: 0, y: 0 })
  })

  it('clamps absurd flick speeds and still lands on a real icon', () => {
    const { engine, centre } = makeEngine()
    drag(engine, -60, 1, 1, 0)
    settle()
    const last = centre.mock.calls.at(-1)![0] as number
    expect(SNAP).toContain(last)
  })

  it('never settles on a ghost cell, even when it is the nearest one', () => {
    const { engine, els, centre } = makeEngine()
    drag(engine, 100, 10, 40, 250) // brings the ghost at x=-100 to the middle
    settle()
    expect(centre.mock.calls.every(([i]) => i !== 6)).toBe(true)
    const p = pan(els[0]!)
    const landed = SNAP.some((i) => Math.abs(-CELLS[i]!.x - p.x) < 0.01 && Math.abs(-CELLS[i]!.y - p.y) < 0.01)
    expect(landed).toBe(true)
  })

  it('a touch that never became a drag does not trigger a release', () => {
    const { engine } = makeEngine()
    engine.pointerDown(ptr(10, 10, 0))
    engine.pointerUp(ptr(10, 10, 30))
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('FieldEngine wheel + focus', () => {
  it('pans on wheel and re-snaps only after the wheel goes quiet', () => {
    const { engine, els, centre } = makeEngine()
    engine.wheel(-160, 0)
    expect(pan(els[0]!)).toEqual({ x: 160, y: 0 })
    vi.advanceTimersByTime(100)
    expect(pan(els[0]!).x).toBe(160) // still waiting for the wheel to stop
    engine.wheel(320, 0) // more ticks reset the timer
    vi.advanceTimersByTime(100)
    expect(pan(els[0]!).x).toBe(-160)
    settle()
    expect(pan(els[0]!)).toEqual({ x: -100, y: 0 })
    expect(centre).toHaveBeenLastCalledWith(3)
  })

  it('focusCell glides the requested cell to the centre', () => {
    const { engine, els, centre } = makeEngine()
    engine.focusCell(4)
    settle()
    expect(pan(els[0]!)).toEqual({ x: -50, y: 86.6 })
    expect(centre).toHaveBeenLastCalledWith(4)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('focusCell ignores an unknown cell', () => {
    const { engine } = makeEngine()
    engine.focusCell(99)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('destroy cancels any running animation', () => {
    const { engine } = makeEngine()
    engine.focusCell(3)
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    engine.destroy()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('a new touch stops an in-flight glide instead of fighting it', () => {
    const { engine } = makeEngine()
    engine.focusCell(3)
    engine.pointerDown(ptr(0, 0, pointerT + 1))
    expect(vi.getTimerCount()).toBe(0)
  })
})
