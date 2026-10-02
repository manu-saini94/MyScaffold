import { useRef } from 'react'
import { m } from 'motion/react'
import { ProgressiveImage } from '../../components/ProgressiveImage/ProgressiveImage'
import { useOnVisible } from '../../features/world/useOnVisible'
import type { WorldLayoutProps } from '../types'
import styles from './PlaceholderLayout.module.scss'

const EASE = [0.16, 1, 0.3, 1] as const

/** Stand-in for every layout until its real one lands: a responsive photo grid that ends the world at its bottom. */
export function PlaceholderLayout({ world, onFinished, onOpenPhoto }: WorldLayoutProps) {
  const endRef = useRef<HTMLDivElement>(null)
  useOnVisible(endRef, onFinished)
  const count = world.moments.length

  return (
    <div className={styles.layout}>
      <ul className={styles.grid}>
        {world.moments.map((moment, i) => {
          const label = moment.caption ?? `Photo ${i + 1} of ${count}`
          return (
            <m.li
              key={moment.id}
              className={styles.cell}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '0px 0px -8% 0px' }}
              transition={{ duration: 0.55, ease: EASE, delay: (i % 3) * 0.06 }}
            >
              <button type="button" className={styles.tile} onClick={() => onOpenPhoto(i)} aria-label={`Open ${label}`}>
                <ProgressiveImage
                  media={moment.media}
                  alt={label}
                  priority={i < 2}
                  sizes="(min-width: 1100px) 22rem, (min-width: 560px) 45vw, 92vw"
                />
              </button>
              {moment.caption && <p className={styles.caption}>{moment.caption}</p>}
            </m.li>
          )
        })}
      </ul>
      <div ref={endRef} className={styles.end} aria-hidden="true" />
    </div>
  )
}
