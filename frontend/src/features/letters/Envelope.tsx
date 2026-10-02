import { SEAL_HALVES, WaxSeal } from './WaxSeal'
import styles from './Letters.module.scss'

/** Static envelope art. Sealed: flap down, whole seal. Opened: flap up, the seal broken in two. Decorative. */
export function Envelope({ opened, className }: { opened: boolean; className?: string }) {
  return (
    <span className={`${styles.envelope} ${opened ? styles.envelopeOpened : ''} ${className ?? ''}`} aria-hidden="true">
      <span className={styles.envBack} />
      {opened && <span className={styles.envSheet} />}
      <span className={styles.envPocket} />
      <span className={styles.envFlap} />
      <span className={styles.envSeal}>
        {opened ? (
          <>
            <WaxSeal className={styles.brokenLeft} style={{ clipPath: SEAL_HALVES.left }} />
            <WaxSeal className={styles.brokenRight} style={{ clipPath: SEAL_HALVES.right }} />
          </>
        ) : (
          <WaxSeal />
        )}
      </span>
    </span>
  )
}
