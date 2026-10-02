import type { CSSProperties } from 'react'
import { Rose } from './Rose'
import styles from './RoseDecor.module.scss'

type Variant = 'bloom' | 'sprig' | 'stem'

interface Placement {
  variant: Variant
  /** Horizontal anchor: `left` or `right` offset in %. */
  side: 'left' | 'right'
  at: number
  /** Width as a fraction of the cluster unit (--rose-unit). */
  w: number
  rot: number
  /** Sway period (s) and phase offset (s, negative so it starts mid-swing). */
  dur: number
  delay: number
  /** Extra vertical offset in % of the rose's own height (negative tucks it off-screen). */
  lift?: number
  mirror?: boolean
  /** Only on wide screens (>= 700px). */
  wide?: boolean
}

// Bouquets rise from the bottom corners; garlands hang in from the top corners. The centre stays clear for content.
const BOTTOM: readonly Placement[] = [
  { variant: 'stem', side: 'left', at: -2, w: 0.95, rot: -16, dur: 7.2, delay: -1.1 },
  { variant: 'stem', side: 'left', at: 3.5, w: 1.2, rot: -5, dur: 8.4, delay: -3.6 },
  { variant: 'stem', side: 'left', at: 10, w: 0.85, rot: 9, dur: 6.6, delay: -2.2 },
  { variant: 'stem', side: 'left', at: 15, w: 0.7, rot: 18, dur: 7.8, delay: -0.4, wide: true },
  { variant: 'bloom', side: 'left', at: 19.5, w: 0.62, rot: 14, dur: 6.1, delay: -4.4, lift: 18, wide: true },
  { variant: 'stem', side: 'right', at: -1, w: 1.05, rot: 14, dur: 7.6, delay: -2.7, mirror: true },
  { variant: 'stem', side: 'right', at: 5.5, w: 0.8, rot: 3, dur: 6.9, delay: -0.9, mirror: true },
  { variant: 'stem', side: 'right', at: 11, w: 1.1, rot: -10, dur: 8.1, delay: -4.8 },
  { variant: 'stem', side: 'right', at: 17, w: 0.72, rot: -19, dur: 7.1, delay: -1.8, wide: true },
  { variant: 'bloom', side: 'right', at: 21, w: 0.58, rot: -12, dur: 6.4, delay: -3.1, lift: 16, wide: true },
]

const TOP: readonly Placement[] = [
  { variant: 'sprig', side: 'left', at: -9, w: 2.7, rot: 92, dur: 9.4, delay: -2.4 },
  { variant: 'stem', side: 'left', at: 7, w: 0.85, rot: 186, dur: 7.3, delay: -1.2, lift: -38 },
  { variant: 'bloom', side: 'left', at: 13, w: 0.62, rot: 200, dur: 6.5, delay: -3.9, lift: -30 },
  { variant: 'stem', side: 'left', at: 19, w: 0.66, rot: 172, dur: 8.2, delay: -5.1, lift: -52, wide: true },
  { variant: 'sprig', side: 'right', at: -9, w: 2.5, rot: 92, dur: 8.8, delay: -4.1, mirror: true },
  { variant: 'stem', side: 'right', at: 8, w: 0.8, rot: 176, dur: 7.9, delay: -0.6, lift: -40, mirror: true },
  { variant: 'bloom', side: 'right', at: 14, w: 0.56, rot: 162, dur: 6.8, delay: -2.8, lift: -28 },
  { variant: 'stem', side: 'right', at: 20, w: 0.62, rot: 190, dur: 7.4, delay: -3.3, lift: -50, wide: true },
]

function Item({ p, edge }: { p: Placement; edge: 'top' | 'bottom' }) {
  const style = {
    [p.side]: `${p.at}%`,
    '--w': p.w,
    '--rot': `${p.rot}deg`,
    '--flip': p.mirror ? -1 : 1,
    '--lift': `${p.lift ?? 0}%`,
    '--dur': `${p.dur}s`,
    '--delay': `${p.delay}s`,
  } as CSSProperties
  return (
    <span className={`${styles.item} ${styles[edge]} ${p.wide ? styles.wide : ''}`} style={style}>
      <Rose variant={p.variant} size="100%" className={styles.rose} />
    </span>
  )
}

/** Rose clusters at the top and bottom of the page, gently swaying. Decorative; hidden on Cinema via tokens. */
export function RoseDecor() {
  return (
    <div className={styles.decor} aria-hidden="true">
      {TOP.map((p, i) => (
        <Item key={`t${i}`} p={p} edge="top" />
      ))}
      {BOTTOM.map((p, i) => (
        <Item key={`b${i}`} p={p} edge="bottom" />
      ))}
    </div>
  )
}
