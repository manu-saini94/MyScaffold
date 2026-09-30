import type { CSSProperties } from 'react'

const PETAL = 'M50 54 C30 52 16 34 28 19 C37 8 55 9 60 21 C64 32 58 46 50 54Z'
const LEAF = 'M0 0 C8 -15 28 -17 42 -8 C31 6 12 11 0 0Z'
const SPIRAL = 'M50 50 c-4 -1 -6 -6 -2 -9 c5 -3 11 1 9 7 c-2 6 -10 7 -14 2 c-4 -6 0 -14 8 -15'

function layer(scale: number, offset: number, fill: string, strokeWidth: number) {
  return [0, 1, 2, 3, 4].map((i) => (
    <path
      key={`${scale}-${i}`}
      d={PETAL}
      fill={fill}
      stroke="var(--rose-line)"
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      transform={`translate(50 50) rotate(${offset + i * 72}) scale(${scale}) translate(-50 -50)`}
    />
  ))
}

/** The bloom itself, drawn in a 100x100 box. Few paths, no gradients, colours come from theme tokens. */
function Bloom() {
  return (
    <g>
      {layer(1, 0, 'var(--rose-b)', 1.1)}
      {layer(0.74, 36, 'var(--rose-a)', 1)}
      {layer(0.46, 8, 'var(--rose-c)', 0.9)}
      <path d={SPIRAL} fill="none" stroke="var(--rose-line)" strokeWidth="1.1" strokeLinecap="round" />
    </g>
  )
}

function Leaf({ x, y, rot, s = 1 }: { x: number; y: number; rot: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <path d={LEAF} fill="var(--leaf)" stroke="var(--leaf-line)" strokeWidth="1" strokeLinejoin="round" />
      <path d="M2 -1 C14 -7 26 -8 38 -7" fill="none" stroke="var(--leaf-line)" strokeWidth="0.8" strokeLinecap="round" />
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

/** Reusable inline-SVG red rose. `bloom` = single flower, `sprig` = bloom + bud + leaves on a stem for framing. */
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
      <path
        d="M14 192 C40 150 62 128 96 108 C118 95 128 84 132 70"
        fill="none"
        stroke="var(--leaf-line)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path d="M62 132 C70 122 78 118 90 116" fill="none" stroke="var(--leaf-line)" strokeWidth="1.6" strokeLinecap="round" />
      <Leaf x={40} y={158} rot={-58} s={1.1} />
      <Leaf x={66} y={134} rot={12} s={1.25} />
      <Leaf x={92} y={112} rot={-38} s={0.95} />
      <Leaf x={120} y={98} rot={20} s={0.8} />
      <g transform="translate(88 6) scale(0.98)">
        <Bloom />
      </g>
      <g transform="translate(44 112) scale(0.36)">
        <Bloom />
      </g>
    </svg>
  )
}
