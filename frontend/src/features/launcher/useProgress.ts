import { useMemo, useSyncExternalStore } from 'react'
import { parseProgress, readProgressRaw, type Progress } from './progress'

function subscribe(cb: () => void) {
  window.addEventListener('storage', cb)
  return () => window.removeEventListener('storage', cb)
}

/**
 * Per-world progress for the rings. Other tabs notify via `storage`. Same-tab writes by the world shell are picked up
 * on the next render (useSyncExternalStore re-reads the snapshot every render, and the home re-renders when a world
 * closes). The snapshot is the raw string, so it is cheap and compares by value.
 */
export function useProgress(): Progress {
  const raw = useSyncExternalStore(subscribe, readProgressRaw, () => null)
  return useMemo(() => parseProgress(raw), [raw])
}
