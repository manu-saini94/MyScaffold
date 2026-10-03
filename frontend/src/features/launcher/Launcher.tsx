import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { World } from '../../types/world'
import { Hero } from './Hero'
import { LoadFailed } from './LoadFailed'
import { OrbField } from './OrbField'
import { useWorldList } from './useWorlds'
import styles from './Launcher.module.scss'

/** The home: hero title near the top, the worlds scattered as photo orbs below. `active` is false while a world is open. */
export function Launcher({ active }: { active: boolean }) {
  const { worlds, isError, refetch, appTitle, tagline } = useWorldList()
  const navigate = useNavigate()
  const onOpen = useCallback((w: World) => void navigate(`/world/${w.slug}`), [navigate])

  return (
    <main className={styles.launcher} data-home-layer>
      <Hero title={appTitle} tagline={tagline} />
      {isError ? <LoadFailed onRetry={refetch} /> : <OrbField worlds={worlds} active={active} onOpen={onOpen} />}
    </main>
  )
}
