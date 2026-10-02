import { lazy, Suspense } from 'react'
import type { LightboxSlide } from './slides'

export interface LightboxProps {
  open: boolean
  slides: LightboxSlide[]
  index: number
  onClose: () => void
  /** Called when a slide becomes active (also for the first one). */
  onView?: (index: number) => void
}

const LightboxImpl = lazy(() => import('./LightboxImpl'))

/** Full-screen photo viewer with pinch/scroll zoom, swipe and captions. Its code loads the first time it opens. */
export function Lightbox({ open, ...rest }: LightboxProps) {
  if (!open) return null
  return (
    <Suspense fallback={null}>
      <LightboxImpl {...rest} />
    </Suspense>
  )
}
