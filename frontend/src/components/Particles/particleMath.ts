import type { ParticleKind } from '../../types/world'

export interface Particle {
  x: number
  y: number
  vy: number
  size: number
  phase: number
  sway: number
  rot: number
  spin: number
  alpha: number
  heart: boolean
  tone: 0 | 1
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)

export function createParticle(kind: ParticleKind, w: number, h: number, scatter: boolean): Particle {
  const petals = kind === 'petals'
  return {
    x: rand(0, w),
    y: scatter ? rand(0, h) : petals ? rand(-40, -10) : h + rand(10, 40),
    vy: petals ? rand(18, 44) : -rand(14, 40),
    size: petals ? rand(7, 15) : rand(1.6, 4.2),
    phase: rand(0, Math.PI * 2),
    sway: rand(14, 42),
    rot: rand(0, Math.PI * 2),
    spin: rand(-1.4, 1.4),
    alpha: petals ? rand(0.35, 0.8) : rand(0.3, 0.85),
    heart: !petals && Math.random() < 0.22,
    tone: Math.random() < 0.5 ? 0 : 1,
  }
}

export function stepParticle(p: Particle, dt: number, t: number, w: number, h: number, kind: ParticleKind) {
  p.y += p.vy * dt
  p.x += Math.sin(t * 0.8 + p.phase) * p.sway * dt
  p.rot += p.spin * dt
  const off = kind === 'petals' ? p.y > h + 30 : p.y < -30
  if (off || p.x < -40 || p.x > w + 40) Object.assign(p, createParticle(kind, w, h, false))
}

function petalPath(ctx: CanvasRenderingContext2D, s: number, flip: number) {
  // A curled petal: one bezier outline, squashed by `flip` to fake 3D tumbling.
  ctx.beginPath()
  ctx.moveTo(0, -s)
  ctx.bezierCurveTo(s * 0.9 * flip, -s * 0.6, s * 0.8 * flip, s * 0.5, 0, s)
  ctx.bezierCurveTo(-s * 0.7 * flip, s * 0.4, -s * 0.9 * flip, -s * 0.6, 0, -s)
  ctx.closePath()
}

/** The shared canvas heart, centred on the origin, about 2s tall. Used by particles, click hearts and the heart rain. */
export function heartPath(ctx: CanvasRenderingContext2D, s: number) {
  ctx.beginPath()
  ctx.moveTo(0, s * 0.9)
  ctx.bezierCurveTo(-s * 1.6, -s * 0.1, -s * 0.7, -s * 1.2, 0, -s * 0.35)
  ctx.bezierCurveTo(s * 0.7, -s * 1.2, s * 1.6, -s * 0.1, 0, s * 0.9)
  ctx.closePath()
}

export function drawParticle(
  ctx: CanvasRenderingContext2D,
  p: Particle,
  kind: ParticleKind,
  colors: [string, string],
) {
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.fillStyle = colors[p.tone]
  if (kind === 'petals') {
    ctx.globalAlpha = p.alpha
    ctx.rotate(p.rot)
    petalPath(ctx, p.size, 0.35 + Math.abs(Math.cos(p.rot * 1.3 + p.phase)) * 0.65)
    ctx.fill()
  } else {
    const flicker = 0.65 + 0.35 * Math.sin(p.phase + p.y * 0.04)
    ctx.globalAlpha = p.alpha * flicker
    if (p.heart) {
      ctx.rotate(Math.sin(p.phase + p.y * 0.01) * 0.3)
      heartPath(ctx, p.size * 1.7)
      ctx.fill()
    } else {
      ctx.shadowColor = colors[1]
      ctx.shadowBlur = p.size * 4
      ctx.beginPath()
      ctx.arc(0, 0, p.size, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}
