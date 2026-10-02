import type { Profile } from '../../types/api'

/** First visible character of a name, upper-cased ("anvi" -> "A"); "?" for an empty name. Pure. */
export function monogram(name: string): string {
  const first = Array.from(name.trim())[0]
  return first ? first.toLocaleUpperCase() : '?'
}

/** Finds the viewer and decoy profiles; either may be missing if the server sends fewer. Pure. */
export function splitProfiles(profiles: readonly Profile[]): { viewer?: Profile; decoy?: Profile } {
  return {
    viewer: profiles.find((p) => p.role === 'viewer'),
    decoy: profiles.find((p) => p.role === 'decoy'),
  }
}
