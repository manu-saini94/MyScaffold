/** Small deterministic PRNG (mulberry32) seeded from a string, so a letter keeps the same torn edge. */
function rng(seed: string): () => number {
  let h = 1779033703
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A deckle (hand-torn paper) edge as a CSS clip-path polygon: every edge wobbles inward by 0..`depth` px.
 * `steps` points per edge; the result is stable for the same seed.
 */
export function deckleClipPath(seed: string, steps = 28, depth = 4): string {
  const r = rng(seed)
  const j = () => `${(r() * depth).toFixed(1)}px`
  const pts: string[] = []
  for (let i = 0; i < steps; i++) pts.push(`${((i / steps) * 100).toFixed(2)}% ${j()}`)
  for (let i = 0; i < steps; i++) pts.push(`calc(100% - ${j()}) ${((i / steps) * 100).toFixed(2)}%`)
  for (let i = 0; i < steps; i++) pts.push(`${(100 - (i / steps) * 100).toFixed(2)}% calc(100% - ${j()})`)
  for (let i = 0; i < steps; i++) pts.push(`${j()} ${(100 - (i / steps) * 100).toFixed(2)}%`)
  return `polygon(${pts.join(', ')})`
}
