/** Pure helpers for the film strip: frame sizing, scroll mapping and the date-back stamp. */

const MIN_ASPECT = 0.68
const MAX_ASPECT = 1.6
/** Classic 35mm frame, used when a photo has no dimensions. */
const FILM_ASPECT = 1.5

/** Width / height of a frame on the strip: the photo's own shape, clamped so panoramas and tall shots stay frames. */
export function frameAspect(width: number | null, height: number | null): number {
  if (!width || !height || width <= 0 || height <= 0) return FILM_ASPECT
  return Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, width / height))
}

/** How far (px) the track moves sideways: its overflow beyond the visible window, never negative. */
export function stripTravel(trackWidth: number, viewportWidth: number): number {
  return Math.max(0, Math.round(trackWidth - viewportWidth))
}

/**
 * Index of the frame whose centre is nearest the viewport centre (both measured from the track's left edge).
 * Frames differ in width, so this is not a linear map of scroll progress. Ties keep the earlier frame.
 */
export function nearestFrame(centers: readonly number[], viewportCenter: number): number {
  if (!Number.isFinite(viewportCenter)) return 0
  let best = 0
  let bestDistance = Infinity
  centers.forEach((c, i) => {
    const d = Math.abs(c - viewportCenter)
    if (d < bestDistance) {
      bestDistance = d
      best = i
    }
  })
  return best
}

/**
 * Scroll offset (along the scroll axis) that centres a frame in the window.
 * `start` is where the strip's scroll range begins; `frameCenter` is measured from the track's left edge.
 */
export function offsetForFrame(start: number, frameCenter: number, viewportWidth: number, travel: number): number {
  const shift = Math.min(travel, Math.max(0, frameCenter - viewportWidth / 2))
  return Math.round(start + shift)
}

/** Two-digit frame number, as printed on a film edge ("07"). */
export function frameNumber(index: number): string {
  return String(index + 1).padStart(2, '0')
}

const DATE = /^(\d{2})(\d{2})-(\d{2})-(\d{2})/

/** Date-back camera stamp ("'19 03 02") from a YYYY-MM-DD date or an ISO instant; null when there is no date. */
export function dateStamp(value: string | null | undefined): string | null {
  const match = value ? DATE.exec(value) : null
  if (!match) return null
  const [, , yy, mm, dd] = match
  if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return null
  return `'${yy} ${mm} ${dd}`
}
