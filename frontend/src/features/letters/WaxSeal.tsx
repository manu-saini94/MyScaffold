import { useId, type CSSProperties } from 'react'

/** Jagged crack down the middle of the seal; each half clips to one side of it. */
export const SEAL_HALVES = {
  left: 'polygon(0 0, 53% 0, 47% 22%, 56% 41%, 46% 60%, 55% 79%, 49% 100%, 0 100%)',
  right: 'polygon(53% 0, 100% 0, 100% 100%, 49% 100%, 55% 79%, 46% 60%, 56% 41%, 47% 22%)',
} as const

// a wax blob: a circle with a soft wobble, plus the pressed inner ring and an embossed heart
const BLOB =
  'M50 3c9 0 13 4 20 6s14 6 18 13 4 13 6 20 3 13 0 20-6 12-12 17-12 10-19 13-13 5-21 4-13-3-20-6-12-7-16-14S1 61 2 53s2-14 5-21 7-13 13-18S41 3 50 3z'
const HEART = 'M50 68C38 59 30 52 30 43c0-6 4-10 9-10 5 0 8 3 11 7 3-4 6-7 11-7 5 0 9 4 9 10 0 9-8 16-20 25z'

/** A wax seal in `--seal` (the world accent) with an embossed heart. Decorative: always aria-hidden. */
export function WaxSeal({ className, style }: { className?: string; style?: CSSProperties }) {
  const id = `seal${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const wax = `${id}-wax`
  const emboss = `${id}-emboss`
  return (
    <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={wax} cx="36%" cy="30%" r="75%">
          <stop offset="0%" style={{ stopColor: 'color-mix(in srgb, var(--seal-c) 55%, #fff)' }} />
          <stop offset="45%" style={{ stopColor: 'var(--seal-c)' }} />
          <stop offset="100%" style={{ stopColor: 'color-mix(in srgb, var(--seal-c) 62%, #000)' }} />
        </radialGradient>
        <filter id={emboss} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.4" stdDeviation="0.6" floodColor="#fff" floodOpacity="0.45" />
          <feDropShadow dx="0" dy="-1.2" stdDeviation="0.7" floodColor="#000" floodOpacity="0.45" />
        </filter>
      </defs>
      <path d={BLOB} fill={`url(#${wax})`} />
      <circle cx="50" cy="51" r="31" fill="none" stroke="rgba(0,0,0,0.22)" strokeWidth="2.4" />
      <circle cx="50" cy="51" r="31" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1" transform="translate(0 1.2)" />
      <path d={HEART} fill={`url(#${wax})`} filter={`url(#${emboss})`} />
    </svg>
  )
}
