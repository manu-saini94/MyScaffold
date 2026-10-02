import { describe, expect, it } from 'vitest'
import { RAIN_MAX, rainAlpha, spawnRain, stepRain } from './rainMath'

const seeded = () => {
  let s = 7
  return () => ((s = (s * 16807) % 2147483647) / 2147483647)
}

describe('heart rain math', () => {
  it('spawns above the screen within its width and caps the pool', () => {
    const pool = spawnRain([], 500, 390, seeded())
    expect(pool).toHaveLength(RAIN_MAX)
    expect(pool.every((p) => p.x >= 0 && p.x <= 390 && p.y < 0)).toBe(true)
  })

  it('falls and drops hearts once they leave the bottom', () => {
    const pool = spawnRain([], 10, 390, seeded())
    const later = stepRain(pool, 0.05, 844)
    expect(later.every((p, i) => p.y > (pool[i]?.y ?? 0))).toBe(true)
    let p = pool
    for (let i = 0; i < 200 && p.length > 0; i++) p = stepRain(p, 0.05, 844)
    expect(p).toHaveLength(0)
  })

  it('fades in then stays opaque', () => {
    const [h] = spawnRain([], 1, 100, seeded())
    expect(h && rainAlpha(h)).toBe(0)
    expect(h && rainAlpha({ ...h, age: 1 })).toBe(1)
  })
})
