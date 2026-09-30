import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { m } from 'motion/react'
import type { World } from '../../types/world'
import { LockGlyph, WorldGlyph } from './WorldGlyph'
import styles from './WorldIcon.module.scss'

interface WorldIconProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  world: World
  locked: boolean
}

/** Circular launcher icon. The disc carries the shared layoutId that expands into the world view. */
export const WorldIcon = forwardRef<HTMLButtonElement, WorldIconProps>(function WorldIcon(
  { world, locked, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={`${styles.icon} ${locked ? styles.locked : ''} ${className ?? ''}`}
      aria-label={locked ? `${world.title}, locked` : world.title}
      {...rest}
    >
      <m.span layoutId={`world-${world.slug}`} className={styles.disc} style={{ borderRadius: 999 }} />
      <WorldGlyph kind={world.layout} className={styles.glyph} />
      {locked && (
        <span className={styles.lockBadge}>
          <LockGlyph className={styles.lockGlyph} />
        </span>
      )}
    </button>
  )
})

/** Non-interactive filler cell: a memory not yet written. */
export function GhostIcon() {
  return <span className={styles.ghost} aria-hidden="true" />
}
