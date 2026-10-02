import { useEffect, useRef, useState } from 'react'

export interface PollResult<T> {
  data?: T
  error?: unknown
}

export interface PollState<T> extends PollResult<T> {
  /** True once polling has ended (next() returned null, or the request failed with an HTTP status). */
  stopped: boolean
}

const RETRY_MS = 3000

/**
 * Runs `load` now and again after each delay `next` returns, until `next` returns null or the component unmounts.
 * The delay comes from the latest response, so the server's pace is honoured. A network failure retries after
 * 3 seconds; an HTTP error stops polling (the caller shows it). Mount it under a `key` to restart.
 */
export function usePoll<T>(load: () => Promise<PollResult<T>>, next: (value: T) => number | null): PollState<T> {
  const [state, setState] = useState<PollState<T>>({ stopped: false })
  const latest = useRef({ load, next })
  useEffect(() => {
    latest.current = { load, next }
  })

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      const result = await latest.current.load()
      if (cancelled) return
      let delay: number | null
      if (result.data !== undefined) delay = latest.current.next(result.data)
      else delay = typeof (result.error as { status?: unknown } | undefined)?.status === 'number' ? null : RETRY_MS
      setState((prev) => ({ data: result.data ?? prev.data, error: result.error, stopped: delay === null }))
      if (delay !== null) timer = setTimeout(tick, delay)
    }
    void tick()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  return state
}
