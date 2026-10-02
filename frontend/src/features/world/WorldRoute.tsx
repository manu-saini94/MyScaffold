import { Navigate, useParams } from 'react-router-dom'
import { LoadFailed } from '../launcher/LoadFailed'
import { findWorld, isWorldLocked, useWorldList } from '../launcher/useWorlds'
import { WorldView } from './WorldView'

/** Lazy route entry for /world/:slug. Unknown or still-locked worlds bounce back to the launcher once loaded. */
export default function WorldRoute() {
  const { slug } = useParams()
  const { worlds, loading, isError, refetch } = useWorldList()
  if (loading) return null
  if (isError) return <LoadFailed onRetry={refetch} />
  const world = findWorld(worlds, slug)
  if (!world || isWorldLocked(world)) return <Navigate to="/" replace />
  return <WorldView world={world} />
}
