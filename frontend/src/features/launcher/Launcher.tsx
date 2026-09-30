import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { World } from '../../types/world'
import { HoneycombField } from './HoneycombField'
import { WorldLabel } from './WorldLabel'
import { useWorlds } from './useWorlds'
import styles from './Launcher.module.scss'

/** The smartwatch-style home: honeycomb field + centre label. `active` is false while a world is open. */
export function Launcher({ active }: { active: boolean }) {
  const worlds = useWorlds()
  const navigate = useNavigate()
  const [centre, setCentre] = useState(0)
  const [peekId, setPeekId] = useState<number | null>(null)

  const onCenterChange = useCallback((i: number) => setCentre(i), [])
  const onOpen = useCallback((w: World) => void navigate(`/world/${w.slug}`), [navigate])
  const onPeek = useCallback((w: World | null) => setPeekId(w ? w.id : null), [])

  const current = worlds[centre]
  return (
    <main className={styles.launcher}>
      <h1 className={styles.srOnly}>Anvi and Manu: our story</h1>
      <HoneycombField
        worlds={worlds}
        active={active}
        onCenterChange={onCenterChange}
        onOpen={onOpen}
        onPeekLocked={onPeek}
      />
      <WorldLabel world={current} index={centre} total={worlds.length} peeking={current !== undefined && peekId === current.id} />
    </main>
  )
}
