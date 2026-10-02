import type { Moment } from '../../types/api'
import { MEDIA_WIDTHS, mediaUrl, type MediaSize } from '../../services/media'

export interface LightboxSlide {
  src: string
  alt: string
  width?: number
  height?: number
  srcSet?: { src: string; width: number; height: number }[]
  title?: string
  description?: string
}

const SIZES: readonly MediaSize[] = ['thumb', 'medium', 'full']

function describe(m: Moment): string | undefined {
  const meta = [m.place, m.happenedOn].filter(Boolean).join(' · ')
  const text = [m.note, meta].filter(Boolean).join('\n')
  return text || undefined
}

/** Lightbox slides for a world's moments: full-size source, srcset when the dimensions are known. */
export function momentsToSlides(moments: readonly Moment[]): LightboxSlide[] {
  return moments.map((m, i) => {
    const { mediaId, width, height } = m.media
    const known = !!width && !!height
    const slide: LightboxSlide = {
      src: mediaUrl(mediaId, 'full'),
      alt: m.caption ?? `Photo ${i + 1} of ${moments.length}`,
      title: m.caption ?? undefined,
      description: describe(m),
    }
    if (!known) return slide
    return {
      ...slide,
      width,
      height,
      srcSet: SIZES.map((s) => {
        const w = Math.min(MEDIA_WIDTHS[s], width)
        return { src: mediaUrl(mediaId, s), width: w, height: Math.round((w * height) / width) }
      }),
    }
  })
}
