import { useEffect } from 'react'
import { burstFor, disposeBursts, playBurst } from './clickEngine'

let users = 0

function onPointerDown(e: PointerEvent) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  const kind = burstFor(e.target)
  if (kind) playBurst(kind, e.clientX, e.clientY)
}

/**
 * Tap anywhere -> a small heart burst at the pointer. Mark a region with `data-click-effect="sparkle"` for the golden
 * burst, or `"none"` to opt out. Safe to call from several screens: one listener and one canvas are shared.
 */
export function useClickEffects(): void {
  useEffect(() => {
    if (users++ === 0) window.addEventListener('pointerdown', onPointerDown, { passive: true })
    return () => {
      if (--users === 0) {
        window.removeEventListener('pointerdown', onPointerDown)
        disposeBursts()
      }
    }
  }, [])
}
