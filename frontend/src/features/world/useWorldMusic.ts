import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { safeMusicUrl } from '../../services/music'
import { claimMusic, releaseMusic, syncMusicVisibility } from './worldMusic'

/**
 * Music for the world on screen. `musicUrl` undefined means "not known yet" (loading, error) and leaves the current
 * track alone; null (or an unsafe URL) means silence, e.g. a locked world. Reduced motion skips the volume ramps only.
 */
export function useWorldMusic(musicUrl: string | null | undefined): void {
  const [who] = useState(() => Symbol('world'))
  const reduced = useReducedMotion()
  const reducedRef = useRef(reduced)
  const url = musicUrl === undefined ? undefined : safeMusicUrl(musicUrl)

  useEffect(() => {
    reducedRef.current = reduced
  }, [reduced])

  useEffect(() => {
    if (url !== undefined) claimMusic(who, url, reducedRef.current)
  }, [who, url])

  useEffect(() => {
    document.addEventListener('visibilitychange', syncMusicVisibility)
    return () => {
      document.removeEventListener('visibilitychange', syncMusicVisibility)
      releaseMusic(who, reducedRef.current)
    }
  }, [who])
}
