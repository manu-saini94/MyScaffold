import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Modal focus handling: focuses `initial` (else the dialog) on open, keeps Tab inside the dialog, closes on
 * Escape, and returns focus to whatever had it before the dialog opened.
 */
export function useModalFocus(dialog: RefObject<HTMLElement | null>, initial: RefObject<HTMLElement | null>, onClose: () => void) {
  // latest onClose without re-running the open/close effect (that would steal the opener)
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  }, [onClose])

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const root = dialog.current
    ;(initial.current ?? root)?.focus({ preventScroll: true })

    const onKey = (e: KeyboardEvent) => {
      if (!root) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        close.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) {
        e.preventDefault()
        root.focus()
        return
      }
      const active = document.activeElement
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    root?.addEventListener('keydown', onKey)
    return () => {
      root?.removeEventListener('keydown', onKey)
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [dialog, initial])
}
