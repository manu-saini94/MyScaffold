import { afterEach, describe, expect, it, vi } from 'vitest'
import { createParticle, drawParticle, stepParticle, type Particle } from './particleMath'

afterEach(() => vi.restoreAllMocks())

const W = 400
const H = 800

describe('createParticle', () => {
  it('spawns petals just above the viewport and embers just below it', () => {
    for (let i = 0; i < 50; i++) {
      const petal = createParticle('petals', W, H, false)
      expect(petal.y).toBeGreaterThanOrEqual(-40)
      expect(petal.y).toBeLessThanOrEqual(-10)
      expect(petal.vy).toBeGreaterThan(0) // falls
      const ember = createParticle('embers', W, H, false)
      expect(ember.y).toBeGreaterThanOrEqual(H + 10)
      expect(ember.vy).toBeLessThan(0) // rises
    }
  })

  it('scatters the first batch over the whole viewport', () => {
    const ys = Array.from({ length: 100 }, () => createParticle('petals', W, H, true).y)
    expect(ys.every((y) => y >= 0 && y <= H)).toBe(true)
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(H / 2)
  })

  it('keeps sizes in the designed ranges and x inside the viewport', () => {
    for (let i = 0; i < 100; i++) {
      const p = createParticle('petals', W, H, true)
      expect(p.size).toBeGreaterThanOrEqual(7)
      expect(p.size).toBeLessThanOrEqual(15)
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(W)
      const e = createParticle('embers', W, H, true)
      expect(e.size).toBeLessThanOrEqual(4.2)
    }
  })

  it('only makes hearts among embers, about a fifth of the time', () => {
    expect(Array.from({ length: 200 }, () => createParticle('petals', W, H, true).heart).some(Boolean)).toBe(false)
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    expect(createParticle('embers', W, H, true).heart).toBe(true)
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    expect(createParticle('embers', W, H, true).heart).toBe(false)
  })

  it('picks one of the two colour tones', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2)
    expect(createParticle('petals', W, H, true).tone).toBe(0)
    vi.spyOn(Math, 'random').mockReturnValue(0.8)
    expect(createParticle('petals', W, H, true).tone).toBe(1)
  })
})

const base = (over: Partial<Particle> = {}): Particle => ({
  x: 200, y: 100, vy: 30, size: 10, phase: 0, sway: 20, rot: 0, spin: 1, alpha: 0.5, heart: false, tone: 0, ...over,
})

describe('stepParticle', () => {
  it('moves along its velocity, sways and spins', () => {
    const p = base()
    stepParticle(p, 0.5, 1, W, H, 'petals')
    expect(p.y).toBeCloseTo(115)
    expect(p.rot).toBeCloseTo(0.5)
    expect(p.x).not.toBe(200) // sin(0.8) * 20 * 0.5
  })

  it('recycles a petal once it has fallen past the bottom', () => {
    const p = base({ y: H + 29, vy: 100 })
    stepParticle(p, 0.1, 0, W, H, 'petals')
    expect(p.y).toBeLessThan(0) // respawned above the top
  })

  it('recycles an ember once it has risen past the top', () => {
    const p = base({ y: -29, vy: -100 })
    stepParticle(p, 0.1, 0, W, H, 'embers')
    expect(p.y).toBeGreaterThan(H) // respawned below the bottom
  })

  it('recycles a particle that drifted far off the side', () => {
    const p = base({ x: W + 60, y: 300 })
    stepParticle(p, 0.016, 0, W, H, 'petals')
    expect(p.y).toBeLessThan(0)
    expect(p.x).toBeLessThanOrEqual(W)
  })

  it('leaves an on-screen particle alone', () => {
    const p = base()
    stepParticle(p, 0.016, 0, W, H, 'petals')
    expect(p.y).toBeLessThan(101)
    expect(p.y).toBeGreaterThan(100)
  })
})

function fakeCtx() {
  const calls: string[] = []
  const rec = (name: string) => () => void calls.push(name)
  const ctx = {
    save: rec('save'), restore: rec('restore'), translate: rec('translate'), rotate: rec('rotate'),
    beginPath: rec('beginPath'), moveTo: rec('moveTo'), bezierCurveTo: rec('bezier'), closePath: rec('closePath'),
    fill: rec('fill'), arc: rec('arc'),
    fillStyle: '', globalAlpha: 1, shadowColor: '', shadowBlur: 0,
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, raw: ctx, calls }
}

describe('drawParticle', () => {
  const colors: [string, string] = ['#111111', '#222222']

  it('draws a petal as a filled bezier outline in the tone colour, balanced save/restore', () => {
    const { ctx, raw, calls } = fakeCtx()
    drawParticle(ctx, base({ tone: 1, alpha: 0.6 }), 'petals', colors)
    expect(raw.fillStyle).toBe('#222222')
    expect(raw.globalAlpha).toBe(0.6)
    expect(calls.filter((c) => c === 'bezier')).toHaveLength(2)
    expect(calls).toContain('fill')
    expect(calls.filter((c) => c === 'save')).toHaveLength(1)
    expect(calls.filter((c) => c === 'restore')).toHaveLength(1)
  })

  it('draws an ember as a glowing circle', () => {
    const { ctx, raw, calls } = fakeCtx()
    drawParticle(ctx, base({ size: 3 }), 'embers', colors)
    expect(calls).toContain('arc')
    expect(raw.shadowColor).toBe('#222222')
    expect(raw.shadowBlur).toBe(12)
    expect(raw.globalAlpha).toBeLessThanOrEqual(0.5)
    expect(raw.globalAlpha).toBeGreaterThan(0)
  })

  it('draws a heart ember with curves instead of an arc', () => {
    const { ctx, calls } = fakeCtx()
    drawParticle(ctx, base({ heart: true }), 'embers', colors)
    expect(calls).not.toContain('arc')
    expect(calls.filter((c) => c === 'bezier')).toHaveLength(2)
  })
})
