import { addSparks, stepSpark, type Rand, type Spark } from '../../components/ClickEffects/burstMath'

/** How long new hearts keep spawning, and the spawn rate while they do. The fall adds about a second more. */
export const RAIN_SPAWN_MS = 2800
export const RAIN_PER_SECOND = 26
/** Separate cap from the tap bursts: the rain never starves (or is starved by) the click layer. */
export const RAIN_MAX = 110

const between = (rand: Rand, a: number, b: number) => a + rand() * (b - a)

/** One heart entering just above the top edge at a random x, falling with a little sideways drift. */
export function rainHeart(rand: Rand, width: number): Spark {
  return {
    shape: 'heart',
    x: between(rand, 0, width),
    y: between(rand, -40, -12),
    vx: between(rand, -30, 30),
    vy: between(rand, 220, 380),
    gravity: 90,
    drag: 0.15,
    size: between(rand, 7, 15),
    rot: between(rand, -0.5, 0.5),
    spin: between(rand, -1.4, 1.4),
    age: 0,
    life: 6,
    tone: rand() < 0.5 ? 0 : 1,
  }
}

/** Advance the rain by `dt` seconds; hearts that fell below `height` are dropped. */
export function stepRain(pool: readonly Spark[], dt: number, height: number): Spark[] {
  return pool.flatMap((p) => {
    const next = stepSpark(p, dt)
    return next && next.y < height + 30 ? [next] : []
  })
}

/** Add `count` new hearts, capped at RAIN_MAX. */
export function spawnRain(pool: readonly Spark[], count: number, width: number, rand: Rand = Math.random): Spark[] {
  return addSparks(pool, Array.from({ length: count }, () => rainHeart(rand, width)), RAIN_MAX)
}

/** Fade in over the first 0.15s; otherwise fully opaque (they leave by falling off screen). */
export function rainAlpha(p: Spark): number {
  return Math.min(1, p.age / 0.15)
}
