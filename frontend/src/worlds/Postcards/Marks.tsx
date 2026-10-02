import { useId } from 'react'
import styles from './Postcards.module.scss'

const W = 60
const H = 74
const STEP = 6
const HOLES = [
  ...Array.from({ length: W / STEP + 1 }, (_, i) => [i * STEP, 0]),
  ...Array.from({ length: W / STEP + 1 }, (_, i) => [i * STEP, H]),
  ...Array.from({ length: Math.floor(H / STEP) + 1 }, (_, i) => [0, i * STEP + 1]),
  ...Array.from({ length: Math.floor(H / STEP) + 1 }, (_, i) => [W, i * STEP + 1]),
]

/** A perforated stamp in the world's accent colour. */
export function Stamp() {
  const mask = useId()
  return (
    <svg className={styles.stamp} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <defs>
        <mask id={mask}>
          <rect width={W} height={H} fill="#fff" />
          {HOLES.map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.2" fill="#000" />
          ))}
        </mask>
      </defs>
      <g mask={`url(#${mask})`}>
        <rect width={W} height={H} className={styles.stampPaper} />
        <rect x="5" y="5" width={W - 10} height={H - 10} className={styles.stampInk} />
        <rect x="8" y="8" width={W - 16} height={H - 16} fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="0.8" />
        <path
          d="M30 50c-9-6.5-14-11-14-17.2 0-4.1 3.1-7 6.7-7 3 0 5.6 1.8 7.3 4.4 1.7-2.6 4.3-4.4 7.3-4.4 3.6 0 6.7 2.9 6.7 7C44 39 39 43.5 30 50z"
          fill="#fff"
          fillOpacity="0.92"
        />
        <text x="30" y="20" textAnchor="middle" className={styles.stampText}>
          LOVE
        </text>
        <text x="30" y="61" textAnchor="middle" className={styles.stampText}>
          ∞
        </text>
      </g>
    </svg>
  )
}

/** A round postmark with the place on its rim, the date (`02 MAR 2019`) in two lines in the middle and wavy cancellation lines. */
export function Postmark({ place, date }: { place: string | null; date: string | null }) {
  const arc = useId()
  const rim = (place ?? 'With love').toUpperCase().slice(0, 22)
  return (
    <svg className={styles.postmark} viewBox="0 0 168 84" aria-hidden="true">
      <defs>
        <path id={arc} d="M14 42a28 28 0 0 1 56 0" />
      </defs>
      <g className={styles.postmarkInk}>
        <circle cx="42" cy="42" r="35" fill="none" strokeWidth="1.6" />
        <circle cx="42" cy="42" r="23" fill="none" strokeWidth="0.9" />
        <text className={styles.postmarkRim}>
          <textPath href={`#${arc}`} startOffset="50%" textAnchor="middle">
            {rim}
          </textPath>
        </text>
        {date ? (
          <text textAnchor="middle" className={styles.postmarkDate}>
            <tspan x="42" y="41">
              {date.slice(0, 6)}
            </tspan>
            <tspan x="42" y="50">
              {date.slice(7)}
            </tspan>
          </text>
        ) : (
          <text x="42" y="46" textAnchor="middle" className={styles.postmarkDate}>
            ♥
          </text>
        )}
        {[24, 34, 44, 54, 64].map((y) => (
          <path key={y} d={`M80 ${y}q8-6 16 0t16 0t16 0t16 0t16 0`} fill="none" strokeWidth="1.3" />
        ))}
      </g>
    </svg>
  )
}
