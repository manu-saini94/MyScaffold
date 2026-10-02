/** Image variants served by GET /api/media/{id}/{size} (contract 3.3). Widths mirror the backend ImageVariant. */
export type MediaSize = 'thumb' | 'medium' | 'full'

export const MEDIA_WIDTHS: Readonly<Record<MediaSize, number>> = { thumb: 480, medium: 1280, full: 2560 }

const SIZES: readonly MediaSize[] = ['thumb', 'medium', 'full']

export function mediaUrl(mediaId: string, size: MediaSize): string {
  return `/api/media/${encodeURIComponent(mediaId)}/${size}`
}

/** `srcset` value covering every variant, smallest first. */
export function mediaSrcSet(mediaId: string): string {
  return SIZES.map((s) => `${mediaUrl(mediaId, s)} ${MEDIA_WIDTHS[s]}w`).join(', ')
}

const LQIP = /^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+=*$/
const HEX = /^#[0-9a-fA-F]{6}$/

/** The server's tiny placeholder, only when it is a plain base64 image data URI (safe to put inside CSS url()). */
export function safeLqip(lqip: string | null | undefined): string | null {
  return lqip && LQIP.test(lqip) ? lqip : null
}

/** A `#rrggbb` colour, or null for anything else. */
export function safeHex(color: string | null | undefined): string | null {
  return color && HEX.test(color) ? color : null
}
