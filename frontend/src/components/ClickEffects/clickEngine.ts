import { prefersReducedMotion } from '../../hooks/useReducedMotion'
import { addSparks, createBurst, sparkAlpha, sparkScale, stepSpark, type BurstKind, type Spark } from './burstMath'

/**
 * One shared canvas for every tap burst. Created on first use, and the rAF loop runs only while sparks are alive,
 * so an idle page pays nothing. pointer-events: none, so it never steals a tap.
 */
const MAX_DPR = 1.75

let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
let pool: Spark[] = []
let raf = 0
let last = 0
let palette: Record<BurstKind, [string, string]> = { hearts: ['#b3122f', '#e04a63'], sparkle: ['#c9a227', '#f4e3a1'] }
let petalColour = '#e04a63'

function readPalette() {
  const cs = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback
  palette = {
    hearts: [v('--accent', '#b3122f'), v('--accent-2', '#e04a63')],
    sparkle: [v('--gold-2', '#c9a227'), v('--gold-3', '#f4e3a1')],
  }
  petalColour = v('--accent-2', '#e04a63')
}

function ensureCanvas(): CanvasRenderingContext2D | null {
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.setAttribute('aria-hidden', 'true')
    canvas.dataset.clickEffects = ''
    Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '40' })
    document.body.appendChild(canvas)
    ctx = canvas.getContext('2d')
  }
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
  const w = Math.round(window.innerWidth * dpr)
  const h = Math.round(window.innerHeight * dpr)
  if (ctx && (canvas.width !== w || canvas.height !== h)) {
    canvas.width = w
    canvas.height = h
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  return ctx
}

function heartPath(c: CanvasRenderingContext2D, s: number) {
  c.beginPath()
  c.moveTo(0, s * 0.9)
  c.bezierCurveTo(-s * 1.6, -s * 0.1, -s * 0.7, -s * 1.2, 0, -s * 0.35)
  c.bezierCurveTo(s * 0.7, -s * 1.2, s * 1.6, -s * 0.1, 0, s * 0.9)
  c.closePath()
}

function starPath(c: CanvasRenderingContext2D, s: number) {
  // four-point glint: long arms, pinched waist
  c.beginPath()
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? s * 2 : s * 0.42
    const a = (i / 8) * Math.PI * 2
    c.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  c.closePath()
}

function petalPath(c: CanvasRenderingContext2D, s: number, flip: number) {
  c.beginPath()
  c.moveTo(0, -s)
  c.bezierCurveTo(s * 0.9 * flip, -s * 0.6, s * 0.8 * flip, s * 0.5, 0, s)
  c.bezierCurveTo(-s * 0.7 * flip, s * 0.4, -s * 0.9 * flip, -s * 0.6, 0, -s)
  c.closePath()
}

function draw(c: CanvasRenderingContext2D, p: Spark) {
  c.save()
  c.translate(p.x, p.y)
  c.rotate(p.rot)
  const k = sparkScale(p)
  c.scale(k, k)
  c.globalAlpha = sparkAlpha(p)
  if (p.shape === 'heart') {
    c.fillStyle = palette.hearts[p.tone]
    heartPath(c, p.size)
  } else if (p.shape === 'star') {
    c.fillStyle = palette.sparkle[p.tone]
    c.shadowColor = palette.sparkle[1]
    c.shadowBlur = p.size * 3
    starPath(c, p.size)
  } else {
    c.fillStyle = petalColour
    petalPath(c, p.size, 0.35 + Math.abs(Math.cos(p.rot * 1.3)) * 0.65)
  }
  c.fill()
  c.restore()
}

function frame(now: number) {
  const c = ctx
  if (!c) return
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  pool = pool.flatMap((p) => stepSpark(p, dt) ?? [])
  c.clearRect(0, 0, window.innerWidth, window.innerHeight)
  for (const p of pool) draw(c, p)
  raf = pool.length > 0 ? requestAnimationFrame(frame) : 0
}

/** Play a burst at viewport coordinates. No-op under reduced motion or without a 2D canvas (tests). */
export function playBurst(kind: BurstKind, x: number, y: number): void {
  if (prefersReducedMotion()) return
  const c = ensureCanvas()
  if (!c) return
  readPalette()
  pool = addSparks(pool, createBurst(kind, x, y))
  if (!raf) {
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }
}

/** Remove the canvas and stop the loop (last subscriber gone). */
export function disposeBursts(): void {
  cancelAnimationFrame(raf)
  raf = 0
  pool = []
  canvas?.remove()
  canvas = null
  ctx = null
}

/** Which burst a tap on `target` plays: `data-click-effect="sparkle"` / `"none"` on an ancestor overrides hearts. */
export function burstFor(target: EventTarget | null): BurstKind | null {
  const el = target instanceof Element ? target.closest<HTMLElement>('[data-click-effect]') : null
  const v = el?.dataset.clickEffect
  if (v === 'none') return null
  return v === 'sparkle' ? 'sparkle' : 'hearts'
}
