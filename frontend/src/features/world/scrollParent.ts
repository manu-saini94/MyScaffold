import { useLayoutEffect, useRef, type RefObject } from 'react'

/**
 * The element that scrolls `el`: the nearest ancestor with overflow-y auto/scroll (inside the world shell that is the
 * frame; the body never scrolls), else the document's scrolling element.
 */
export function findScrollParent(el: Element | null): HTMLElement {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY
    if (overflow === 'auto' || overflow === 'scroll') return node
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement
}

/**
 * Ref to the scroller around `ref`, filled in a layout effect. Call it BEFORE `useScroll({ container })` in the same
 * component: effects run in declaration order, so the container is hydrated by the time motion starts tracking.
 */
export function useScrollParent(ref: RefObject<Element | null>): RefObject<HTMLElement | null> {
  const scroller = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    scroller.current = findScrollParent(ref.current)
  }, [ref])
  return scroller
}
