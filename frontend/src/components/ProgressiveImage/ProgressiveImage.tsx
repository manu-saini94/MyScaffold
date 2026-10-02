import { useCallback, useState, type CSSProperties } from 'react'
import { mediaSrcSet, mediaUrl, safeHex, safeLqip } from '../../services/media'
import type { MediaRef } from '../../types/api'
import styles from './ProgressiveImage.module.scss'

type LoadState = 'loading' | 'loaded' | 'error'

export interface ProgressiveImageProps {
  media: MediaRef
  /** Describes the photo (usually the caption). Required: there is no decorative photo in this app. */
  alt: string
  /** `sizes` for the srcset; defaults to a phone-first guess. */
  sizes?: string
  /** Load immediately (first screen only). */
  priority?: boolean
  fit?: 'cover' | 'contain'
  className?: string
}

const DEFAULT_SIZES = '(min-width: 1100px) 33vw, (min-width: 560px) 50vw, 100vw'

/**
 * LQIP blur-up -> real image. The box reserves its space from the media dimensions (no layout shift); the
 * blurred placeholder sits underneath and the photo fades in once decoded. A failed load shows a quiet frame.
 * Key it by media id when the photo can change in place, so the load state starts over.
 */
export function ProgressiveImage({ media, alt, sizes = DEFAULT_SIZES, priority = false, fit = 'cover', className }: ProgressiveImageProps) {
  const [state, setState] = useState<LoadState>('loading')
  const { mediaId, width, height } = media

  // A cached image can finish before React attaches onLoad.
  const checkComplete = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth > 0) setState('loaded')
  }, [])

  const lqip = safeLqip(media.lqip)
  const hasDims = !!width && !!height && width > 0 && height > 0
  const style = {
    aspectRatio: hasDims ? `${width} / ${height}` : undefined,
    backgroundColor: safeHex(media.dominantColor) ?? undefined,
    '--lqip': lqip ? `url("${lqip}")` : undefined,
  } as CSSProperties

  return (
    <span className={[styles.frame, className].filter(Boolean).join(' ')} style={style} data-state={state} data-fit={fit}>
      {state === 'error' ? (
        <span className={styles.broken} role="img" aria-label={alt}>
          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
            <path d="M4 6h16v12H4zM4 15l5-5 4 4 3-3 4 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        </span>
      ) : (
        <img
          ref={checkComplete}
          className={styles.img}
          src={mediaUrl(mediaId, 'medium')}
          srcSet={mediaSrcSet(mediaId)}
          sizes={sizes}
          width={hasDims ? width : undefined}
          height={hasDims ? height : undefined}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          onLoad={() => setState('loaded')}
          onError={() => setState('error')}
        />
      )}
    </span>
  )
}
