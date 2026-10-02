import { describe, expect, it } from 'vitest'
import { addSparks, createBurst, MAX_SPARKS, sparkAlpha, sparkScale, stepSpark, type Spark } from './burstMath'

/** Small deterministic PRNG so every run sees the same sparks. */
function lcg(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

function run(p: Spark, seconds: number, dt = 1 / 60): Spark | null {
  let cur: Spark | null = p
  for (let t = 0; t < seconds && cur; t += dt) cur = stepSpark(cur, dt)
  return cur
}

describe('createBurst', () => {
  it('makes 7 hearts at the tap point, all heading upward', () => {
    const sparks = createBurst('hearts', 100, 200, lcg(1))
    expect(sparks).toHaveLength(7)
    for (const s of sparks) {
      expect(s.shape).toBe('heart')
      expect([s.x, s.y]).toEqual([100, 200])
      expect(s.vy).toBeLessThan(0)
      expect(s.gravity).toBeLessThan(0) // keeps drifting up
      expect(s.age).toBe(0)
    }
  })

  it('makes a distinct sparkle burst: a ring of 16 stars plus 5 falling petals', () => {
    const sparks = createBurst('sparkle', 0, 0, lcg(2))
    expect(sparks.filter((s) => s.shape === 'star')).toHaveLength(16)
    const petals = sparks.filter((s) => s.shape === 'petal')
    expect(petals).toHaveLength(5)
    expect(petals.every((p) => p.gravity > 0)).toBe(true)
    // the ring covers every direction: some stars go left, right, up and down
    const stars = sparks.filter((s) => s.shape === 'star')
    expect(stars.some((s) => s.vx > 50) && stars.some((s) => s.vx < -50)).toBe(true)
    expect(stars.some((s) => s.vy > 50) && stars.some((s) => s.vy < -50)).toBe(true)
  })

  it('is deterministic for a given random source', () => {
    expect(createBurst('hearts', 5, 5, lcg(9))).toEqual(createBurst('hearts', 5, 5, lcg(9)))
  })
})

describe('stepSpark', () => {
  it('moves without mutating the input and expires at the end of its life', () => {
    const [p] = createBurst('hearts', 50, 50, lcg(3))
    const before = { ...p! }
    const next = stepSpark(p!, 0.1)!
    expect(p).toEqual(before)
    expect(next.age).toBeCloseTo(0.1)
    expect(next.y).toBeLessThan(50)
    expect(run(p!, p!.life + 0.05)).toBeNull()
  })

  it('hearts end above where they started; petals fall back down', () => {
    const sparks = createBurst('sparkle', 0, 0, lcg(4))
    const petal = sparks.find((s) => s.shape === 'petal')!
    const heart = createBurst('hearts', 0, 0, lcg(4))[0]!
    expect(run(heart, heart.life * 0.9)!.y).toBeLessThan(-20)
    expect(run(petal, petal.life * 0.95)!.y).toBeGreaterThan(0)
  })
})

describe('addSparks', () => {
  it('caps the pool and keeps the newest', () => {
    const a = createBurst('hearts', 1, 1, lcg(5))
    const b = createBurst('hearts', 2, 2, lcg(6))
    const pool = addSparks(a, b, 10)
    expect(pool).toHaveLength(10)
    expect(pool.at(-1)).toBe(b.at(-1))
    expect(pool.filter((s) => s.x === 2)).toHaveLength(7)
  })

  it('defaults to MAX_SPARKS', () => {
    let pool: Spark[] = []
    for (let i = 0; i < 30; i++) pool = addSparks(pool, createBurst('hearts', i, i, lcg(i)))
    expect(pool).toHaveLength(MAX_SPARKS)
  })
})

describe('sparkAlpha / sparkScale', () => {
  const at = (frac: number): Spark => ({ ...createBurst('hearts', 0, 0, lcg(7))[0]!, age: frac, life: 1 })

  it('pops in, then fades to zero', () => {
    expect(sparkAlpha(at(0))).toBe(0)
    expect(sparkAlpha(at(0.1))).toBeCloseTo(1)
    expect(sparkAlpha(at(0.5))).toBeGreaterThan(sparkAlpha(at(0.8)))
    expect(sparkAlpha(at(1))).toBeCloseTo(0)
  })

  it('overshoots at the pop and stays positive', () => {
    expect(sparkScale(at(0.12))).toBeCloseTo(1.15)
    expect(sparkScale(at(0.25))).toBeCloseTo(1)
    expect(sparkScale(at(1))).toBeGreaterThan(0.5)
  })
})
