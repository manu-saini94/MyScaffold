import { useEffect, useMemo } from 'react'
import { useGetExperienceQuery } from '../../services/experienceApi'
import { serverNow } from '../../services/serverClock'
import type { World } from '../../types/world'
import { mapExperienceWorlds } from './mapExperience'

const NONE: readonly World[] = []
/** setTimeout stores a signed 32-bit delay; anything larger fires immediately. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1
/** Past the unlock instant by a beat, so the server clock agrees it has passed; also stops a tight refetch loop. */
const REFETCH_SLACK_MS = 1000

export interface WorldList {
  worlds: readonly World[]
  /** First load in flight (nothing to show yet). */
  loading: boolean
  /** The load failed and there is nothing to show. */
  isError: boolean
  refetch: () => void
}

/**
 * Launcher worlds from GET /api/experience (contract 1.4: never cached, so it refetches on mount). Empty while loading
 * or after a failed load. Refetches once the earliest unlock instant passes on the server clock; until the fresh
 * payload arrives a world stays locked, because the payload (not the clock) says what the viewer may see.
 */
export function useWorldList(): WorldList {
  const { data, isLoading, isError, refetch } = useGetExperienceQuery(undefined, { refetchOnMountOrArgChange: true })
  const worlds = useMemo(() => (data ? mapExperienceWorlds(data.worlds) : NONE), [data])

  useEffect(() => {
    const times = worlds.flatMap((w) => (w.locked && w.unlockAt ? [new Date(w.unlockAt).getTime()] : [])).filter(Number.isFinite)
    if (times.length === 0) return
    const delay = Math.min(MAX_TIMEOUT_MS, Math.max(REFETCH_SLACK_MS, Math.min(...times) - serverNow() + REFETCH_SLACK_MS))
    const id = window.setTimeout(() => void refetch(), delay)
    return () => window.clearTimeout(id)
  }, [worlds, refetch])

  return { worlds, loading: isLoading, isError: isError && !data, refetch: () => void refetch() }
}

export function useWorlds(): readonly World[] {
  return useWorldList().worlds
}

export function findWorld(worlds: readonly World[], slug: string | undefined): World | undefined {
  return worlds.find((w) => w.slug === slug)
}

/** Locked while the last payload said so. Only a fresh payload unlocks (see useWorldList), never the device clock. */
export function isWorldLocked(world: World): boolean {
  return world.locked
}
