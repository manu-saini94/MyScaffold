/** Pure particle math for tap bursts. Kept free of DOM so it is deterministic under a seeded `rand`. */

export type BurstKind = 'hearts' | 'sparkle'
export type SparkShape = 'heart' | 'star' | 'petal'
export type Rand = () => number

export interface Spark {
  shape: SparkShape
  x: number
  y: number
  vx: number
  vy: number
  /** px/s^2 added to vy each second: negative drifts up, positive falls. */
  gravity: number
  /** Velocity damping per second (exponential). */
  drag: number
  size: number
  rot: number
  spin: number
  age: number
  life: number
  /** Index into the palette the renderer passes in. */
  tone: 0 | 1
}

/** Hard cap on live sparks: rapid tapping drops the oldest instead of growing without bound. */
export const MAX_SPARKS = 90

const between = (rand: Rand, a: number, b: number) => a + rand() * (b - a)
const tone = (rand: Rand): 0 | 1 => (rand() < 0.5 ? 0 : 1)

function heart(rand: Rand, x: number, y: number): Spark {
  // Upward fan (straight up is -PI/2), so the hearts rise out of the tap rather than spraying sideways.
  const angle = -Math.PI / 2 + between(rand, -1.15, 1.15)
  const speed = between(rand, 70, 160)
  return {
    shape: 'heart',
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    gravity: -55,
    drag: 1.8,
    size: between(rand, 6, 11),
    rot: between(rand, -0.4, 0.4),
    spin: between(rand, -1.2, 1.2),
    age: 0,
    life: between(rand, 0.85, 1.35),
    tone: tone(rand),
  }
}

function star(rand: Rand, x: number, y: number, i: number, n: number): Spark {
  const angle = (i / n) * Math.PI * 2 + between(rand, -0.2, 0.2)
  const speed = between(rand, 150, 330)
  return {
    shape: 'star',
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    gravity: 30,
    drag: 3.4,
    size: between(rand, 3, 6.5),
    rot: between(rand, 0, Math.PI),
    spin: between(rand, -3, 3),
    age: 0,
    life: between(rand, 0.7, 1.1),
    tone: tone(rand),
  }
}

function petal(rand: Rand, x: number, y: number): Spark {
  const angle = -Math.PI / 2 + between(rand, -1.3, 1.3)
  const speed = between(rand, 70, 150)
  return {
    shape: 'petal',
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    gravity: 140,
    drag: 1.4,
    size: between(rand, 7, 11),
    rot: between(rand, 0, Math.PI * 2),
    spin: between(rand, -2.4, 2.4),
    age: 0,
    life: between(rand, 1.4, 2),
    tone: tone(rand),
  }
}

/** A fresh burst at (x, y): 7 rising hearts, or a 16-star golden ring with 5 tumbling rose petals. */
export function createBurst(kind: BurstKind, x: number, y: number, rand: Rand = Math.random): Spark[] {
  if (kind === 'hearts') return Array.from({ length: 7 }, () => heart(rand, x, y))
  const stars = Array.from({ length: 16 }, (_, i) => star(rand, x, y, i, 16))
  const petals = Array.from({ length: 5 }, () => petal(rand, x, y))
  return [...stars, ...petals]
}

/** Advance one spark by `dt` seconds. Returns null once it has lived out its life. */
export function stepSpark(p: Spark, dt: number): Spark | null {
  const age = p.age + dt
  if (age >= p.life) return null
  const damp = Math.exp(-p.drag * dt)
  const vx = p.vx * damp
  const vy = p.vy * damp + p.gravity * dt
  return { ...p, age, vx, vy, x: p.x + vx * dt, y: p.y + vy * dt, rot: p.rot + p.spin * dt }
}

/** Append new sparks, keeping only the newest MAX_SPARKS (or `cap`). */
export function addSparks(pool: readonly Spark[], fresh: readonly Spark[], cap: number = MAX_SPARKS): Spark[] {
  const all = [...pool, ...fresh]
  return all.length > cap ? all.slice(all.length - cap) : all
}

/** Opacity over a spark's life: quick pop-in (first 10%), then an eased fade to zero. */
export function sparkAlpha(p: Spark): number {
  const t = Math.min(1, Math.max(0, p.age / p.life))
  if (t < 0.1) return t / 0.1
  const f = (t - 0.1) / 0.9
  return 1 - f * f
}

/** Scale over a spark's life: overshoots to 1.15 at the pop, settles to 1, shrinks a little at the end. */
export function sparkScale(p: Spark): number {
  const t = Math.min(1, Math.max(0, p.age / p.life))
  if (t < 0.12) return 0.4 + (t / 0.12) * 0.75
  if (t < 0.25) return 1.15 - ((t - 0.12) / 0.13) * 0.15
  return 1 - (t - 0.25) * 0.3
}
