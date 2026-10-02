import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence } from 'motion/react'
import { HeartRain } from './HeartRain'
import { LoveNote } from './LoveNote'
import { restoreMidnight, toggleMidnight } from './midnight'
import { isKonami, matchNickname, normalizeNicknames, pushKonami, pushTyped, registerTap } from './sequences'
import './midnight.scss'

/** True while the user is typing into a field: the eggs must never hijack real input. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target.closest('input, textarea, select')) return true
  const editable = target.closest('[contenteditable]')
  return editable !== null && editable.getAttribute('contenteditable') !== 'false'
}

interface EasterEggsProps {
  /** experience.easterEggNicknames */
  nicknames: readonly string[]
  /** Injectable clock (ms) for the title tap burst. */
  now?: () => number
}

/**
 * The hidden delights. Mount once, app-wide:
 * - type a nickname anywhere (not in a field) -> heart rain;
 * - Konami code -> toggles the "midnight" look (persisted);
 * - five taps within 3s on any element marked data-easter="title" -> a secret love note.
 */
export function EasterEggs({ nicknames, now = Date.now }: EasterEggsProps) {
  const [rain, setRain] = useState(0)
  const [note, setNote] = useState(false)
  const names = useMemo(() => normalizeNicknames(nicknames), [nicknames])
  const endRain = useCallback(() => setRain(0), [])
  const closeNote = useCallback(() => setNote(false), [])

  useLayoutEffect(() => restoreMidnight(), [])

  useEffect(() => {
    const max = Math.max(0, ...names.map((n) => n.length))
    let typed = ''
    let keys: string[] = []
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return
      keys = pushKonami(keys, e.key)
      if (isKonami(keys)) {
        keys = []
        toggleMidnight()
      }
      typed = pushTyped(typed, e.key, max)
      if (matchNickname(typed, names)) {
        typed = ''
        setRain((n) => n + 1)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [names])

  useEffect(() => {
    let taps: number[] = []
    const onClick = (e: MouseEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('[data-easter="title"]')) return
      const r = registerTap(taps, now())
      taps = r.taps
      if (r.fired) setNote(true)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [now])

  return createPortal(
    <>
      {rain > 0 && <HeartRain key={rain} onDone={endRain} />}
      <AnimatePresence>{note && <LoveNote key="note" onClose={closeNote} />}</AnimatePresence>
    </>,
    document.body,
  )
}
