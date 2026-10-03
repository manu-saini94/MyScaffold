import { describe, expect, it, vi } from 'vitest'
import { heartBurst } from './heartBurst'

const lib = vi.hoisted(() => {
  const fire = vi.fn(() => null)
  return { fire, create: vi.fn(() => fire), shapeFromPath: vi.fn(() => ({ type: 'path' })) }
})
vi.mock('canvas-confetti', () => ({ default: lib }))

describe('heartBurst', () => {
  it('fires through one confetti.create instance without a web worker (CSP blocks blob: workers)', async () => {
    await heartBurst({ x: 0.5, y: 0.5 })
    await heartBurst({ x: 0.2, y: 0.8 })
    expect(lib.create).toHaveBeenCalledTimes(1)
    expect(lib.create).toHaveBeenCalledWith(undefined, expect.objectContaining({ useWorker: false }))
    expect(lib.fire).toHaveBeenCalledTimes(4)
    expect(lib.fire).toHaveBeenLastCalledWith(expect.objectContaining({ origin: { x: 0.2, y: 0.8 }, disableForReducedMotion: true }))
  })

  it('never throws when confetti fails', async () => {
    lib.fire.mockImplementationOnce(() => {
      throw new Error('no Path2D')
    })
    await expect(heartBurst({ x: 0.5, y: 0.5 })).resolves.toBeUndefined()
  })
})
