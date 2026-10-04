import { useEffect, useRef } from 'react'
import { MUSIC_VOLUME, fadeTo } from '../../services/music'

const FADE_MS = 1400

function start(audio: HTMLAudioElement) {
  // A refused play() (autoplay policy, unreachable file) leaves the story silent; music is optional by design.
  audio.play()?.catch(() => undefined)
}

/**
 * One looping track per chapter (`url`, already validated). Nothing is created or played until `enabled` (set by
 * the visitor's Play press), so there is never audio before a gesture. A new URL crossfades: the old track fades
 * out and stops while the new one fades in; the same URL across chapters keeps playing.
 */
export function useStoryMusic({ url, enabled, playing, muted }: { url: string | null; enabled: boolean; playing: boolean; muted: boolean }) {
  const current = useRef<HTMLAudioElement | null>(null)
  const playingRef = useRef(playing)
  const mutedRef = useRef(muted)

  useEffect(() => {
    playingRef.current = playing
    const audio = current.current
    if (!audio) return
    if (playing) start(audio)
    else audio.pause()
  }, [playing])

  useEffect(() => {
    mutedRef.current = muted
    if (current.current) current.current.muted = muted
  }, [muted])

  useEffect(() => {
    if (!enabled || !url) return
    const audio = new Audio(url)
    audio.loop = true
    audio.volume = 0
    audio.muted = mutedRef.current
    current.current = audio
    if (playingRef.current) start(audio)
    const cancelIn = fadeTo(audio, MUSIC_VOLUME, FADE_MS)
    return () => {
      cancelIn()
      if (current.current === audio) current.current = null
      fadeTo(audio, 0, FADE_MS, () => audio.pause())
    }
  }, [url, enabled])
}
