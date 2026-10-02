import { safeHex, safeLqip } from '../../services/media'
import type { World } from '../../types/world'

export interface OrbPhoto {
  mediaId: string
  /** Blur-up placeholder (cover only: preview ids carry no LQIP). */
  lqip: string | null
  color: string | null
}

/** Pure: the one photo an orb shows. Cover first, else the first preview. Locked worlds never carry media. */
export function orbPhoto(world: World): OrbPhoto | null {
  if (world.locked) return null
  if (world.cover) {
    return { mediaId: world.cover.mediaId, lqip: safeLqip(world.cover.lqip), color: safeHex(world.cover.dominantColor) }
  }
  const first = world.previewMediaIds[0]
  return first ? { mediaId: first, lqip: null, color: null } : null
}

export interface TitleParts {
  left: string
  right: string
}

const HEART = /\s*(?:❤️?|♥️?|&)\s*/u

/** Pure: "Anvi ❤ Manu" -> { left: 'Anvi', right: 'Manu' } so the heart can be drawn (and beat). Null when there is no heart. */
export function splitTitle(title: string): TitleParts | null {
  const m = HEART.exec(title)
  if (!m) return null
  const left = title.slice(0, m.index).trim()
  const right = title.slice(m.index + m[0].length).trim()
  return left && right ? { left, right } : null
}

/** Compact countdown for an orb face: "112d 04:09" until the last day, then "04:09:27". */
export function compactCountdown(r: { days: number; hours: number; minutes: number; seconds: number }): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return r.days > 0 ? `${r.days}d ${p(r.hours)}:${p(r.minutes)}` : `${p(r.hours)}:${p(r.minutes)}:${p(r.seconds)}`
}
