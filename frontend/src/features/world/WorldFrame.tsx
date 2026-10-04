import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { m } from 'motion/react'
import { safeHex } from '../../services/media'
import { MusicToggle } from './MusicToggle'
import { useWorldMusic } from './useWorldMusic'
import styles from './World.module.scss'

interface WorldFrameProps {
  slug: string
  /** themeAccent from the API; anything but #rrggbb falls back to the theme accent. */
  accent: string | null | undefined
  /** musicUrl of the world on screen: undefined while unknown (loading), null for none (or locked). */
  musicUrl: string | null | undefined
  children: ReactNode
}

/**
 * Full-screen world surface. It carries the shared layoutId with the home orb, so it is rendered from the first
 * frame (even while loading) and the orb can expand into it. Escape and the back control return home.
 * Closing a deep-linked world fades it out instead (no shared element was set up).
 */
export function WorldFrame({ slug, accent, musicUrl, children }: WorldFrameProps) {
  const navigate = useNavigate()
  useWorldMusic(musicUrl)
  const frameRef = useRef<HTMLElement>(null)

  useEffect(() => {
    // move focus into the world (not onto a control, so no focus ring flashes on arrival)
    frameRef.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // a modal (the lightbox) handles its own Escape
      if (e.target instanceof Element && e.target.closest('[aria-modal="true"]')) return
      void navigate('/')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  const hex = safeHex(accent)
  const style = { borderRadius: 0, ...(hex ? { '--world-accent': hex } : {}) } as CSSProperties

  // On the first page of the session (deep link, reload) the orb mounts AFTER this frame and would take the shared
  // layout lead, leaving the frame stuck invisible in the orb's shape. There is no orb to grow from then: fade in.
  // Decided once at mount: during the exit animation the live location key changes, which would flip the exit mode.
  const locationKey = useLocation().key
  const [firstEntry] = useState(() => locationKey === 'default')

  return (
    <m.section
      ref={frameRef}
      tabIndex={-1}
      layoutId={firstEntry ? undefined : `world-${slug}`}
      className={styles.frame}
      style={style}
      aria-labelledby="world-title"
      initial={firstEntry ? { opacity: 0 } : undefined}
      animate={firstEntry ? { opacity: 1 } : undefined}
      exit={{ opacity: firstEntry ? 0 : 1 }}
    >
      <m.div
        className={styles.inner}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { delay: 0.18, duration: 0.4 } }}
        exit={{ opacity: 0, transition: { duration: 0.12 } }}
      >
        <nav className={styles.bar} aria-label="World">
          <Link to="/" className={styles.back}>
            <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
              <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            All chapters
          </Link>
          <MusicToggle />
        </nav>
        {children}
      </m.div>
    </m.section>
  )
}
