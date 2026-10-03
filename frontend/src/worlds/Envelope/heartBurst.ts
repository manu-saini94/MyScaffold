// canvas-confetti loads on first use, inside this layout's chunk only.
const HEART_PATH =
  'M167 72c19,-38 37,-56 75,-56 42,0 76,33 76,75 0,76 -76,151 -151,227 -76,-76 -151,-151 -151,-227 0,-42 33,-75 75,-75 38,0 57,18 76,56z'
const COLORS = ['#b3122f', '#e04a63', '#f7a1b0', '#c9a227', '#f4e3a1']
let instance: import('canvas-confetti').CreateTypes | undefined

/** Heart-shaped confetti from a point given in viewport fractions (0..1). Off for reduced motion; never throws. */
export async function heartBurst(origin: { x: number; y: number }): Promise<void> {
  try {
    const { default: lib } = await import('canvas-confetti')
    // No web worker: the default instance loads one from a blob: URL, which the CSP (script-src 'self') blocks.
    instance ??= lib.create(undefined, { useWorker: false, resize: true })
    const confetti = instance
    const heart = lib.shapeFromPath({ path: HEART_PATH })
    const base = { origin, shapes: [heart], colors: COLORS, disableForReducedMotion: true, zIndex: 40, ticks: 220 }
    void confetti({ ...base, particleCount: 46, spread: 80, startVelocity: 34, scalar: 2.2, gravity: 0.75 })
    void confetti({ ...base, particleCount: 28, spread: 130, startVelocity: 22, scalar: 1.4, gravity: 0.6, drift: 0.2 })
  } catch {
    // decoration only: a missing chunk or Path2D must never break the proposal
  }
}
