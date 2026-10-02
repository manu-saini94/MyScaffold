import { m } from 'motion/react'
import type { OpenWorldDetail } from '../../types/api'
import { Envelope } from './Envelope'
import { useLetterReader } from './useLetterReader'
import styles from './Letters.module.scss'

/** WORLD_OUTRO letters: sealed envelopes laid out in the outro. Renders nothing when the world has none. */
export function OutroLetters({ world }: { world: OpenWorldDetail }) {
  const letters = world.letters.filter((l) => l.revealTrigger === 'WORLD_OUTRO')
  const { opened, open, dialog } = useLetterReader(world.themeAccent)
  if (letters.length === 0) return null

  return (
    <div className={`${styles.sealScope} ${styles.outroLetters}`}>
      <p className={styles.outroLead}>{letters.length === 1 ? 'A letter, left for you' : 'Letters, left for you'}</p>
      <ul className={styles.outroList}>
        {letters.map((letter, i) => {
          const isOpen = opened.has(letter.id)
          return (
            <m.li
              key={letter.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 + i * 0.12, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <button type="button" className={styles.outroCard} onClick={() => open(letter)} data-click-effect="sparkle">
                <Envelope opened={isOpen} className={styles.outroEnvelope} />
                <span className={styles.outroTitle}>{letter.title}</span>
                <span className={styles.outroHint}>{isOpen ? 'Opened · read again' : 'Sealed · tap to open'}</span>
              </button>
            </m.li>
          )
        })}
      </ul>
      {dialog}
    </div>
  )
}
