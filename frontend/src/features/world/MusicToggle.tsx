import { useSyncExternalStore } from 'react'
import { musicStatus, subscribeMusic, toggleMusic } from './worldMusic'
import styles from './World.module.scss'

/** Floating ♪ switch in the world bar. Hidden when there is nothing to play; asks for a tap when autoplay was refused. */
export function MusicToggle() {
  const status = useSyncExternalStore(subscribeMusic, musicStatus, musicStatus)
  if (status === 'off') return null
  if (status === 'blocked') {
    return (
      <button type="button" className={`${styles.music} ${styles.musicAsk}`} onClick={toggleMusic}>
        Tap for music ♪
      </button>
    )
  }
  return (
    <button type="button" className={styles.music} onClick={toggleMusic} aria-label="Mute music" aria-pressed={status === 'muted'}>
      <span aria-hidden="true">♪</span>
    </button>
  )
}
