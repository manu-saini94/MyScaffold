import { WORLDS_MOCK } from './worldsMock'
import type { World } from '../../types/world'

/** Single swap point: later this becomes useGetWorldsQuery() from experienceApi. */
export function useWorlds(): readonly World[] {
  return WORLDS_MOCK
}

export function findWorld(slug: string | undefined): World | undefined {
  return WORLDS_MOCK.find((w) => w.slug === slug)
}

export function isWorldLocked(world: World, now: number = Date.now()): boolean {
  return world.locked && world.unlockAt !== null && new Date(world.unlockAt).getTime() > now
}
