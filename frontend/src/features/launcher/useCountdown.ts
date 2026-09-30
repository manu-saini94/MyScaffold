import { useEffect, useState } from 'react'

export interface Remaining {
  days: number
  hours: number
  minutes: number
  seconds: number
  done: boolean
}

function compute(target: number, now: number): Remaining {
  const ms = Math.max(0, target - now)
  const total = Math.floor(ms / 1000)
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
    done: ms === 0,
  }
}

/** Ticks once a second, and only while the component using it is mounted (i.e. while the peek is visible). */
export function useCountdown(targetIso: string | null): Remaining {
  const target = targetIso ? new Date(targetIso).getTime() : 0
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return compute(target, now)
}
