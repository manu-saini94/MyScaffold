import { hashString, mulberry32 } from '../launcher/scatter'

/** A slow pan and zoom: scale and translate (in % of the photo) at the start and the end of the slide. */
export interface KenBurns {
  s0: number
  s1: number
  x0: number
  y0: number
  x1: number
  y1: number
}

const round = (n: number) => Math.round(n * 1000) / 1000

/**
 * Seeded by the moment id, so a photo always moves the same way. Mostly zooms in, sometimes out. The pan never
 * exceeds the zoom's spare margin, so the photo's edges stay inside its frame.
 */
export function kenBurns(seed: string): KenBurns {
  const rand = mulberry32(hashString(seed))
  const near = 1.03 + rand() * 0.03
  const far = 1.12 + rand() * 0.06
  const zoomIn = rand() < 0.65
  const s0 = zoomIn ? near : far
  const s1 = zoomIn ? far : near
  // half the extra size, in %, is how far the photo can slide before an edge shows
  const room = (s: number) => ((s - 1) / 2) * 100 * 0.9
  const shift = (s: number) => (rand() * 2 - 1) * room(s)
  return { s0: round(s0), s1: round(s1), x0: round(shift(s0)), y0: round(shift(s0)), x1: round(shift(s1)), y1: round(shift(s1)) }
}
