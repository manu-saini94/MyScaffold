import { useEffect, useState } from 'react'
import { serverNow } from '../../services/serverClock'
import { computeRemaining, type Remaining } from './countdown'

export type { Remaining }

/** Counts down on the server clock. Ticks once a second, and only while the component using it is mounted (i.e. while the peek is visible). */
export function useCountdown(targetIso: string | null): Remaining {
  const target = targetIso ? new Date(targetIso).getTime() : 0
  const [now, setNow] = useState(() => serverNow())
  useEffect(() => {
    const id = window.setInterval(() => setNow(serverNow()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return computeRemaining(target, now)
}
