import { Navigate, useParams } from 'react-router-dom'
import { findWorld, isWorldLocked } from '../launcher/useWorlds'
import { WorldView } from './WorldView'

/** Lazy route entry for /world/:slug. Unknown or still-locked worlds bounce back to the launcher. */
export default function WorldRoute() {
  const { slug } = useParams()
  const world = findWorld(slug)
  if (!world || isWorldLocked(world)) return <Navigate to="/" replace />
  return <WorldView world={world} />
}
