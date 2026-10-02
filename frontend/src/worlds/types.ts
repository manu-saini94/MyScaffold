import type { OpenWorldDetail } from '../types/api'

export type { OpenWorldDetail }

/**
 * Props of every world layout (default export of worlds/<Layout>/index.tsx).
 * The shell owns intro, outro, letters, lightbox, progress and "Next chapter"; a layout only shows the moments.
 *
 * - `onOpenPhoto(index)`: open the lightbox at `world.moments[index]`.
 * - `onFinished()`: the viewer reached the end of the layout; the shell reveals the outro. Calling it again is harmless.
 *
 * Inside the shell a layout can use these CSS variables:
 * `--world-accent` (validated themeAccent, else the theme accent), `--world-accent-soft`, `--world-accent-glow`,
 * `--world-ink` (gold body text), `--world-gold-gradient` (display text background).
 */
export interface WorldLayoutProps {
  world: OpenWorldDetail
  onFinished: () => void
  onOpenPhoto: (index: number) => void
}
