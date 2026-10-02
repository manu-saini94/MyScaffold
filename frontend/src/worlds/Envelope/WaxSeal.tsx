import { useId } from 'react'

// A slightly wobbly disc, like pressed wax. Deterministic, built once.
const BLOB = (() => {
  const pts: string[] = []
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2
    const r = 45 + 2.4 * Math.sin(a * 7) + 1.3 * Math.sin(a * 3 + 1.1)
    pts.push(`${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`)
  }
  return `M${pts.join('L')}Z`
})()

const HEART = 'M50 70C35 59 27 51 27 42c0-6 5-11 11-11 5 0 9 3 12 7 3-4 7-7 12-7 6 0 11 5 11 11 0 9-8 17-23 28z'

/** Red wax seal with an embossed heart. Purely decorative: the button around it carries the label. */
export function WaxSeal() {
  const id = useId()
  const wax = `${id}-wax`
  const rim = `${id}-rim`
  return (
    <svg viewBox="-9 -9 118 118" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={wax} cx="36%" cy="30%" r="75%">
          <stop offset="0" stopColor="#e2425c" />
          <stop offset="0.45" stopColor="#b3122f" />
          <stop offset="1" stopColor="#6e0818" />
        </radialGradient>
        <radialGradient id={rim} cx="60%" cy="66%" r="60%">
          <stop offset="0" stopColor="#7d0c20" />
          <stop offset="1" stopColor="#a01029" />
        </radialGradient>
      </defs>
      <path d={BLOB} fill={`url(#${wax})`} />
      <circle cx="50" cy="50" r="31" fill={`url(#${rim})`} opacity="0.55" />
      <circle cx="50" cy="50" r="31" fill="none" stroke="#f08a9a" strokeOpacity="0.45" strokeWidth="1.2" />
      <circle cx="50" cy="50" r="34.5" fill="none" stroke="#5c0614" strokeOpacity="0.45" strokeWidth="1" />
      {/* emboss: light edge up-left, dark edge down-right, pressed face in the middle */}
      <path d={HEART} fill="none" stroke="#ff9fb0" strokeOpacity="0.7" strokeWidth="2" transform="translate(-0.8 -0.8)" />
      <path d={HEART} fill="none" stroke="#4a0410" strokeOpacity="0.6" strokeWidth="2" transform="translate(0.9 0.9)" />
      <path d={HEART} fill="#9c0f27" />
      <ellipse cx="38" cy="30" rx="10" ry="5" fill="#fff" opacity="0.18" transform="rotate(-28 38 30)" />
    </svg>
  )
}
