import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import { useGetAuthStatusQuery } from '../../services/authApi'
import { selectProfile, selectSessionStatus, statusResolved } from './sessionSlice'

type GateRoute = 'unlock' | 'who' | 'app'

/**
 * Boot guard. Resolves GET /auth/status once, then routes by session state:
 * locked -> /unlock, unlocked without a profile -> /who, unlocked with a profile -> the app.
 * `route` says which screen the wrapped children are.
 */
export function SessionGate({ route, children }: { route: GateRoute; children: ReactNode }) {
  const dispatch = useAppDispatch()
  const status = useAppSelector(selectSessionStatus)
  const profile = useAppSelector(selectProfile)
  const { data, isError, refetch } = useGetAuthStatusQuery()
  // Session state when this gate first resolved; null until then.
  const [arrivedUnlocked, setArrivedUnlocked] = useState<boolean | null>(null)

  useEffect(() => {
    if (data) dispatch(statusResolved(data.unlocked))
  }, [data, dispatch])

  if (status === 'unknown') {
    if (!isError) return null
    return (
      <p role="alert" style={{ padding: '2rem', textAlign: 'center' }}>
        Cannot reach the server.{' '}
        <button type="button" onClick={() => void refetch()}>
          Try again
        </button>
      </p>
    )
  }

  // Adjust-state-during-render pattern: records the first resolved status exactly once.
  if (arrivedUnlocked === null) setArrivedUnlocked(status === 'unlocked')

  if (status === 'locked') return route === 'unlock' ? <>{children}</> : <Navigate to="/unlock" replace />
  // Unlocking on this screen must not cut its bloom short: the screen navigates itself when the animation ends.
  if (route === 'unlock') return arrivedUnlocked ? <Navigate to="/who" replace /> : <>{children}</>
  if (route === 'app' && !profile) return <Navigate to="/who" replace />
  return <>{children}</>
}
