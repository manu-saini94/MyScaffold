import type { CSSProperties } from 'react'

const LINE = {
  fill: 'none',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  vectorEffect: 'non-scaling-stroke',
} as const

/** Side-view rose in a 100x100 box: spiralled bud, a rim of petals, a front swirl and a base. Six strokes, one accent dot. */
function Bloom() {
  return (
    <g stroke="var(--accent)" strokeWidth="1.5">
      <path {...LINE} d="M38 40 C33 27 41 17 52 14 C63 17 68 27 62 40" />
      <path {...LINE} d="M46 20 C42 26 46 34 53 32 C58 30 58 23 53 21 C50 20 48 22 49 25" />
      <path {...LINE} d="M38 40 C28 34 20 40 21 50 C22 66 34 78 50 80 C66 78 79 66 80 50 C81 40 72 34 62 40" />
      <path {...LINE} d="M38 40 C40 46 46 48 50 46 C56 48 60 44 62 40" />
      <path {...LINE} d="M30 52 C34 64 43 70 50 70 C58 70 66 64 70 52 M50 46 C45 54 45 63 50 70" />
      <path {...LINE} d="M36 84 C42 92 58 92 64 84" />
      <circle cx="53" cy="26" r="1.7" fill="var(--accent)" stroke="none" />
    </g>
  )
}

function Leaf({ x, y, rot, s = 1 }: { x: number; y: number; rot: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`} stroke="var(--leaf-line)" strokeWidth="1.1">
      <path {...LINE} d="M0 0 C8 -13 26 -15 40 -6 C29 7 11 10 0 0Z" />
      <path {...LINE} d="M3 -1 C16 -6 27 -7 37 -6" />
    </g>
  )
}

interface RoseProps {
  variant?: 'bloom' | 'sprig'
  size?: number | string
  className?: string
  style?: CSSProperties
  title?: string
}

/** Reusable inline-SVG line-art rose. `bloom` = single flower, `sprig` = bloom + bud + leaves on a stem for framing. */
export function Rose({ variant = 'bloom', size = 96, className, style, title }: RoseProps) {
  const a11y = title ? { role: 'img' as const, 'aria-label': title } : { 'aria-hidden': true as const }
  if (variant === 'bloom') {
    return (
      <svg viewBox="0 0 100 100" width={size} height={size} className={className} style={style} {...a11y}>
        <Bloom />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={className} style={style} {...a11y}>
      <g stroke="var(--leaf-line)" strokeWidth="1.3">
        <path {...LINE} d="M14 192 C46 154 78 132 108 112 C126 102 138 102 141 98" />
        <path {...LINE} d="M80 132 C80 120 74 110 66 102" />
      </g>
      <Leaf x={40} y={162} rot={-58} s={1.05} />
      <Leaf x={70} y={139} rot={14} s={1.15} />
      <Leaf x={104} y={115} rot={-40} s={0.9} />
      <path
        {...LINE}
        d="M66 102 C58 96 57 86 63 80 C70 85 72 95 66 102Z"
        stroke="var(--accent)"
        strokeWidth="1.3"
        fill="var(--accent)"
        fillOpacity="0.85"
      />
      <g transform="translate(92 8) scale(0.98)">
        <Bloom />
      </g>
    </svg>
  )
}
