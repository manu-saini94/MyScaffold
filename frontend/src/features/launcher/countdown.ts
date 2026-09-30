export interface Remaining {
  days: number
  hours: number
  minutes: number
  seconds: number
  done: boolean
}

/** Time left between `now` and `target` (both epoch ms). Clamps at zero; a NaN target counts as done. */
export function computeRemaining(target: number, now: number): Remaining {
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
