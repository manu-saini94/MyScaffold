import { useSyncExternalStore } from 'react'

const MODAL = '[aria-modal="true"]'

function subscribe(cb: () => void) {
  // dialogs mount (letters, love note, lightbox portal) or flip aria-modal anywhere in the document
  const mo = new MutationObserver(cb)
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-modal'] })
  return () => mo.disconnect()
}

const snapshot = () => document.querySelector(MODAL) !== null

/** True while any aria-modal dialog is in the document. Auto-advancing layouts hold still under it. */
export function useModalOpen(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
