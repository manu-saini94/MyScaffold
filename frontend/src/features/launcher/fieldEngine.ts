import type { Cell } from './hexLayout'
import { fisheye } from './fisheye'

interface EngineOptions {
  reducedMotion: boolean
  /** Fired (rarely) when the world-cell nearest the centre changes. */
  onCenterChange: (cellIndex: number) => void
}

const DRAG_THRESHOLD = 7
const MAX_SPEED = 3200
const MAX_DT = 1 / 30

/**
 * Imperative pan/inertia/fisheye engine. It owns a rAF loop that only runs while something moves,
 * and writes transform/opacity motion values directly, so React never re-renders per frame.
 * (Mutable on purpose: this is the hot path.)
 */
export class FieldEngine {
  private cells: readonly Cell[] = []
  private snapTargets: number[] = []
  private els = new Map<number, HTMLElement>()
  private radius = 300
  private limit = 0

  private px = 0
  private py = 0
  private vx = 0
  private vy = 0
  private tx = 0
  private ty = 0

  private raf = 0
  private lastT = 0
  private dragging = false
  private pointerId = -1
  private startX = 0
  private startY = 0
  private lastX = 0
  private lastY = 0
  private lastMoveT = 0
  private movedFar = false
  private wheelTimer = 0
  private center = -1

  constructor(private readonly opts: EngineOptions) {}

  /** True if the gesture that just ended was a drag (used to swallow the click). */
  get wasDrag(): boolean {
    return this.movedFar
  }

  setOptions(reducedMotion: boolean) {
    this.opts.reducedMotion = reducedMotion
  }

  setLayout(cells: readonly Cell[], snapTargets: number[], radius: number) {
    this.cells = cells
    this.snapTargets = snapTargets
    this.radius = radius
    this.limit = cells.reduce((m, c) => Math.max(m, Math.hypot(c.x, c.y)), 0)
    this.center = -1
    this.render()
  }

  register(index: number, el: HTMLElement | null) {
    if (el) this.els.set(index, el)
    else this.els.delete(index)
  }

  /** Recentre so that `cellIndex` sits in the middle (used by keyboard focus and taps). */
  focusCell(cellIndex: number) {
    const c = this.cells[cellIndex]
    if (!c) return
    this.tx = -c.x
    this.ty = -c.y
    this.start()
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    window.clearTimeout(this.wheelTimer)
    this.raf = 0
  }

  // ---- pointer gesture -------------------------------------------------------------------

  pointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    this.pointerId = e.pointerId
    this.dragging = true
    this.movedFar = false
    this.startX = this.lastX = e.clientX
    this.startY = this.lastY = e.clientY
    this.lastMoveT = e.timeStamp
    this.vx = this.vy = 0
    cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  /** Returns true once the drag threshold is crossed so the caller can capture the pointer. */
  pointerMove(e: PointerEvent): boolean {
    if (!this.dragging || e.pointerId !== this.pointerId) return false
    const dx = e.clientX - this.lastX
    const dy = e.clientY - this.lastY
    if (!this.movedFar && Math.hypot(e.clientX - this.startX, e.clientY - this.startY) < DRAG_THRESHOLD) return false
    const justCrossed = !this.movedFar
    this.movedFar = true
    // rubber band once past the outermost cell
    const past = Math.hypot(this.px, this.py) > this.limit
    const k = past ? 0.32 : 1
    this.px += dx * k
    this.py += dy * k
    const dt = Math.max(1, e.timeStamp - this.lastMoveT) / 1000
    this.vx = this.vx * 0.55 + ((dx * k) / dt) * 0.45
    this.vy = this.vy * 0.55 + ((dy * k) / dt) * 0.45
    this.lastX = e.clientX
    this.lastY = e.clientY
    this.lastMoveT = e.timeStamp
    this.render()
    return justCrossed
  }

  pointerUp(e: PointerEvent) {
    if (!this.dragging || e.pointerId !== this.pointerId) return
    this.dragging = false
    if (!this.movedFar) return
    // a pause before release kills the flick
    if (e.timeStamp - this.lastMoveT > 90) this.vx = this.vy = 0
    this.release()
  }

  /** Trackpad / mouse wheel panning; re-snaps shortly after the last tick. */
  wheel(dx: number, dy: number) {
    this.px -= dx
    this.py -= dy
    this.vx = this.vy = 0
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.render()
    window.clearTimeout(this.wheelTimer)
    this.wheelTimer = window.setTimeout(() => this.release(), 140)
  }

  // ---- settling --------------------------------------------------------------------------

  private release() {
    const reduced = this.opts.reducedMotion
    const speed = Math.hypot(this.vx, this.vy)
    if (speed > MAX_SPEED) {
      this.vx *= MAX_SPEED / speed
      this.vy *= MAX_SPEED / speed
    }
    if (reduced) this.vx = this.vy = 0
    // land where the flick would carry us, then snap to the nearest world icon
    const projX = this.px + this.vx * 0.16
    const projY = this.py + this.vy * 0.16
    const idx = this.nearest(-projX, -projY, this.snapTargets)
    const c = this.cells[idx]
    this.tx = c ? -c.x : 0
    this.ty = c ? -c.y : 0
    this.start()
  }

  private start() {
    if (this.raf) return
    this.lastT = performance.now()
    this.raf = requestAnimationFrame(this.tick)
  }

  private tick = (now: number) => {
    const dt = Math.min(MAX_DT, (now - this.lastT) / 1000)
    this.lastT = now
    const w = this.opts.reducedMotion ? 22 : 9 // spring stiffness; reduced motion = quick, non-flourishy settle
    this.px = this.spring(this.px, this.tx, 'x', w, dt)
    this.py = this.spring(this.py, this.ty, 'y', w, dt)
    const done =
      Math.abs(this.px - this.tx) < 0.25 && Math.abs(this.py - this.ty) < 0.25 && Math.hypot(this.vx, this.vy) < 3
    if (done) {
      this.px = this.tx
      this.py = this.ty
      this.vx = this.vy = 0
      this.raf = 0
    } else {
      this.raf = requestAnimationFrame(this.tick)
    }
    this.render()
  }

  /** Critically damped spring, semi-implicit Euler. */
  private spring(x: number, target: number, axis: 'x' | 'y', w: number, dt: number): number {
    const v = axis === 'x' ? this.vx : this.vy
    const a = -w * w * (x - target) - 2 * w * v
    const nv = v + a * dt
    if (axis === 'x') this.vx = nv
    else this.vy = nv
    return x + nv * dt
  }

  private nearest(cx: number, cy: number, among: readonly number[]): number {
    let best = among[0] ?? 0
    let bestD = Infinity
    for (const i of among) {
      const c = this.cells[i]
      if (!c) continue
      const d = (c.x - cx) ** 2 + (c.y - cy) ** 2
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    return best
  }

  // ---- render: transforms + opacity only -------------------------------------------------

  render() {
    let nearestIdx = -1
    let nearestD = Infinity
    for (const c of this.cells) {
      const x = c.x + this.px
      const y = c.y + this.py
      const d = Math.hypot(x, y)
      const el = this.els.get(c.index)
      if (el) {
        const f = fisheye(d, this.radius)
        // compositor-only: transform + opacity, written straight to the element (no React, no layout reads)
        el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${f.scale.toFixed(4)})`
        el.style.opacity = f.opacity.toFixed(3)
      }
      if (d < nearestD && this.snapTargets.includes(c.index)) {
        nearestD = d
        nearestIdx = c.index
      }
    }
    if (nearestIdx !== this.center) {
      this.center = nearestIdx
      this.opts.onCenterChange(nearestIdx)
    }
  }
}
