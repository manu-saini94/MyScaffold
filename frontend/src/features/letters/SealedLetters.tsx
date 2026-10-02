import { createPortal } from 'react-dom'
import { m } from 'motion/react'
import type { OpenWorldDetail } from '../../types/api'
import { Envelope } from './Envelope'
import { sealStyle, useLetterReader } from './useLetterReader'
import styles from './Letters.module.scss'

/**
 * SEALED_ICON letters: small sealed envelopes floating at the corner of the world while its layout plays.
 * Portalled to <body> so they stay pinned to the viewport whatever the world frame is doing.
 */
export function SealedLetters({ world }: { world: OpenWorldDetail }) {
  const letters = world.letters.filter((l) => l.revealTrigger === 'SEALED_ICON')
  const { opened, open, dialog } = useLetterReader(world.themeAccent)
  if (letters.length === 0) return null

  return (
    <>
      {createPortal(
        <ul className={`${styles.sealScope} ${styles.corner}`} style={sealStyle(world.themeAccent)} aria-label="Sealed letters">
          {letters.map((letter, i) => {
            const isOpen = opened.has(letter.id)
            return (
              <m.li
                key={letter.id}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.6 + i * 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              >
                <button
                  type="button"
                  className={styles.cornerButton}
                  style={{ animationDelay: `${i * -1.1}s` }}
                  onClick={() => open(letter)}
                  aria-label={`${isOpen ? 'Read again' : 'Open sealed letter'}: ${letter.title}`}
                  data-click-effect="sparkle"
                >
                  <Envelope opened={isOpen} className={styles.cornerEnvelope} />
                </button>
              </m.li>
            )
          })}
        </ul>,
        document.body,
      )}
      {dialog}
    </>
  )
}
