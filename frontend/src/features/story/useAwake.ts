import { useEffect, useState } from 'react'

const WAKE_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'wheel'] as const

/** True while the visitor has moved, tapped or pressed a key within the last `timeoutMs`. */
export function useAwake(timeoutMs: number): boolean {
  const [awake, setAwake] = useState(true)
  useEffect(() => {
    let id = window.setTimeout(() => setAwake(false), timeoutMs)
    const wake = () => {
      setAwake(true)
      window.clearTimeout(id)
      id = window.setTimeout(() => setAwake(false), timeoutMs)
    }
    for (const e of WAKE_EVENTS) window.addEventListener(e, wake, { passive: true })
    return () => {
      window.clearTimeout(id)
      for (const e of WAKE_EVENTS) window.removeEventListener(e, wake)
    }
  }, [timeoutMs])
  return awake
}
