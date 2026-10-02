import { useEffect, useState } from 'react'
import { serverNow } from '../../services/serverClock'

export interface Remaining {
  days: number
  hours: number
  minutes: number
  seconds: number
  done: boolean
}

/** Time left until `target` (epoch ms) at `now`. Clamps at zero; an invalid target counts as done. */
export function remainingUntil(target: number, now: number): Remaining {
  const ms = Number.isFinite(target) ? Math.max(0, target - now) : 0
  const total = Math.floor(ms / 1000)
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
    done: ms === 0,
  }
}

/** Live countdown to `unlockAtIso` on the server clock (serverTime from the last API response), ticking each second. */
export function useUnlockCountdown(unlockAtIso: string): Remaining {
  const [now, setNow] = useState(() => serverNow())
  useEffect(() => {
    const id = window.setInterval(() => setNow(serverNow()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return remainingUntil(new Date(unlockAtIso).getTime(), now)
}

export function formatRemaining(r: Remaining): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const clock = `${pad(r.hours)}:${pad(r.minutes)}:${pad(r.seconds)}`
  return r.days > 0 ? `${r.days}d ${clock}` : clock
}
