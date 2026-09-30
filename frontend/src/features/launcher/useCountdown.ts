import { useEffect, useState } from 'react'
import { computeRemaining, type Remaining } from './countdown'

export type { Remaining }

/** Ticks once a second, and only while the component using it is mounted (i.e. while the peek is visible). */
export function useCountdown(targetIso: string | null): Remaining {
  const target = targetIso ? new Date(targetIso).getTime() : 0
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return computeRemaining(target, now)
}
