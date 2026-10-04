import { MUSIC_VOLUME, fadeTo, readMuted, writeMuted } from '../../services/music'

/**
 * The one music player of the world view. It lives at module level because the Shell remounts the world route on
 * every chapter change: a world that hands over to another with the same track keeps it playing without a gap.
 * A different track crossfades; closing fades out, pauses and releases the element.
 */

export const WORLD_FADE_MS = 1200

/** `off`: nothing to play. `blocked`: the browser refused autoplay, a tap starts it. */
export type MusicStatus = 'off' | 'playing' | 'blocked' | 'muted'

interface Track {
  url: string
  audio: HTMLAudioElement
  cancelFade: () => void
}

const noop = () => undefined

let active: Track | null = null
let owner: symbol | null = null
const leaving = new Set<Track>()
let status: MusicStatus = 'off'
const listeners = new Set<() => void>()

function setStatus(next: MusicStatus) {
  if (status === next) return
  status = next
  for (const listener of listeners) listener()
}

export function subscribeMusic(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function musicStatus(): MusicStatus {
  return status
}

const tabHidden = () => document.visibilityState === 'hidden'

function releaseTrack(track: Track) {
  track.cancelFade()
  leaving.delete(track)
  track.audio.pause()
  track.audio.removeAttribute('src')
  track.audio.load()
}

function fadeIn(track: Track, reduced: boolean) {
  track.cancelFade()
  track.cancelFade = noop
  if (reduced) track.audio.volume = MUSIC_VOLUME
  else track.cancelFade = fadeTo(track.audio, MUSIC_VOLUME, WORLD_FADE_MS)
}

function fadeOut(track: Track, reduced: boolean) {
  track.cancelFade()
  track.cancelFade = noop
  leaving.add(track)
  if (reduced) releaseTrack(track)
  else track.cancelFade = fadeTo(track.audio, 0, WORLD_FADE_MS, () => releaseTrack(track))
}

/** Plays unless muted (shared with story mode) or the tab is hidden (it starts when the tab returns). */
function tryPlay(track: Track) {
  if (readMuted()) {
    setStatus('muted')
    return
  }
  setStatus('playing')
  if (tabHidden()) return
  track.audio.play()?.catch((error: unknown) => {
    if (active !== track || status !== 'playing') return
    // NotAllowedError: no user gesture yet (deep link). Anything else (unreachable file) hides the toggle.
    setStatus(error instanceof DOMException && error.name === 'NotAllowedError' ? 'blocked' : 'off')
  })
}

/** The world shown by `who` wants `url` (null: silence). The same URL as the current track keeps it going. */
export function claimMusic(who: symbol, url: string | null, reduced: boolean): void {
  owner = who
  if (active?.url === url) return
  if (active) fadeOut(active, reduced)
  active = null
  if (!url) {
    setStatus('off')
    return
  }
  const revived = [...leaving].find((t) => t.url === url)
  if (revived) {
    leaving.delete(revived)
    active = revived
    fadeIn(revived, reduced)
    if (revived.audio.paused) tryPlay(revived)
    else setStatus('playing')
    return
  }
  const audio = new Audio(url)
  audio.loop = true
  audio.volume = 0
  active = { url, audio, cancelFade: noop }
  fadeIn(active, reduced)
  tryPlay(active)
}

/** The world shown by `who` closed. A no-op when another world has claimed the music since. */
export function releaseMusic(who: symbol, reduced: boolean): void {
  if (owner !== who) return
  owner = null
  if (active) fadeOut(active, reduced)
  active = null
  setStatus('off')
}

/** The toggle (a user gesture): mutes while playing, otherwise unmutes and plays. Remembered for story mode too. */
export function toggleMusic(): void {
  if (!active) return
  if (status === 'playing') {
    writeMuted(true)
    active.audio.pause()
    setStatus('muted')
    return
  }
  writeMuted(false)
  tryPlay(active)
}

/** Pauses everything while the tab is hidden; resumes the current track on return unless muted or blocked. */
export function syncMusicVisibility(): void {
  if (tabHidden()) {
    for (const track of [...leaving]) releaseTrack(track)
    active?.audio.pause()
  } else if (active && status === 'playing') {
    tryPlay(active)
  }
}
