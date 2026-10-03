import { useEffect, useState } from 'react'
import { serverNow } from '../../services/serverClock'
import { computeRemaining, type Remaining } from './countdown'

export type { Remaining }

/**
 * Counts down on the server clock. Ticks once a second while mounted and `running`; a paused countdown (its orb is
 * covered by an open world) holds its last value and catches up at once when it runs again.
 */
export function useCountdown(targetIso: string | null, running = true): Remaining {
  const target = targetIso ? new Date(targetIso).getTime() : 0
  const [now, setNow] = useState(() => serverNow())
  useEffect(() => {
    if (!running) return
    const tick = () => setNow(serverNow())
    // Catch up at once on resume (from a callback, not the effect body), then tick every second.
    const first = window.setTimeout(tick, 0)
    const id = window.setInterval(tick, 1000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(id)
    }
  }, [running])
  return computeRemaining(target, now)
}
