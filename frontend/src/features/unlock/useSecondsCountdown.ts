import { useEffect, useRef, useState } from 'react'

/** Counts down from `seconds` once per second and calls `onDone` when it reaches zero. Remount (key) to restart. */
export function useSecondsCountdown(seconds: number, onDone: () => void): number {
  const [remaining, setRemaining] = useState(seconds)
  const doneRef = useRef(onDone)

  useEffect(() => {
    doneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    const id = window.setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (remaining <= 0) doneRef.current()
  }, [remaining])

  return remaining
}
