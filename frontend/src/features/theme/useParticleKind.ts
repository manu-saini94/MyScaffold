import { useSyncExternalStore } from 'react'
import { useStore } from 'react-redux'
import type { ParticleKind } from '../../types/world'

function readKind(): ParticleKind {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--particle-kind').trim()
  return v === 'embers' ? 'embers' : 'petals'
}

/** Reads --particle-kind from the active theme tokens (theme is applied to <html> before the store updates). */
export function useParticleKind(): ParticleKind {
  const store = useStore()
  return useSyncExternalStore((cb) => store.subscribe(cb), readKind, () => 'petals')
}
