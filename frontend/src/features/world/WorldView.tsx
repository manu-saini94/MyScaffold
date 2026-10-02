import { useEffect, useRef, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { m } from 'motion/react'
import type { World } from '../../types/world'
import styles from './WorldView.module.scss'

const TILE_COUNT = 8
// Deliberately uneven: varied spans and aspect ratios so the placeholder wall already feels editorial.
const SHAPES = ['tall', 'wide', 'sq', 'sq', 'tall', 'sq', 'wide', 'sq'] as const

/** Placeholder full-screen world view. Real per-layout galleries arrive in a later phase. */
export function WorldView({ world }: { world: World }) {
  const navigate = useNavigate()
  const backRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    backRef.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void navigate('/')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  const tint = { '--tint-a': world.tint[0], '--tint-b': world.tint[1] } as CSSProperties

  return (
    <m.section
      layoutId={`world-${world.slug}`}
      className={styles.world}
      style={{ ...tint, borderRadius: 0 }}
      aria-labelledby="world-title"
      exit={{ opacity: 1 }}
    >
      <m.div
        className={styles.content}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0, transition: { delay: 0.22, duration: 0.45, ease: [0.16, 1, 0.3, 1] } }}
        exit={{ opacity: 0, transition: { duration: 0.12 } }}
      >
        <Link ref={backRef} to="/" className={styles.back}>
          <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to all chapters
        </Link>

        <header className={styles.head}>
          <p className={styles.eyebrow}>Chapter {String(world.chapter).padStart(2, '0')}</p>
          <h1 id="world-title" className={styles.title}>
            {world.title}
          </h1>
          <p className={styles.sub}>{world.subtitle}</p>
        </header>

        <ul className={styles.wall}>
          {Array.from({ length: TILE_COUNT }, (_, i) => (
            <m.li
              key={i}
              className={`${styles.tile} ${styles[SHAPES[i % SHAPES.length]!]}`}
              style={{ '--i': i } as CSSProperties}
              initial={{ opacity: 0, y: 18, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: { delay: 0.32 + i * 0.05, duration: 0.5, ease: [0.16, 1, 0.3, 1] } }}
            >
              <span className={styles.caption}>Photo {String(i + 1).padStart(2, '0')}</span>
            </m.li>
          ))}
        </ul>
      </m.div>
    </m.section>
  )
}
