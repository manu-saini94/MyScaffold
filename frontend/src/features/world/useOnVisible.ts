import { useEffect, useRef, type RefObject } from 'react'

/**
 * Calls `onVisible` once, the first time `ref` scrolls into view. Without IntersectionObserver it counts as visible
 * at once, so nothing that depends on it (outro, "finished") can get stuck.
 */
export function useOnVisible(ref: RefObject<Element | null>, onVisible: () => void, rootMargin = '0px'): void {
  const cb = useRef(onVisible)
  useEffect(() => {
    cb.current = onVisible
  }, [onVisible])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      cb.current()
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect()
          cb.current()
        }
      },
      { rootMargin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [ref, rootMargin])
}
