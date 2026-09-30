import { Rose } from './Rose'
import styles from './RoseDecor.module.scss'

/** Two corner sprigs of line-art roses. Purely decorative; hidden on the Cinema theme via tokens. */
export function RoseDecor() {
  return (
    <div className={styles.decor} aria-hidden="true">
      <Rose variant="sprig" size="min(44vw, 320px)" className={styles.topLeft} />
      <Rose variant="sprig" size="min(40vw, 290px)" className={styles.bottomRight} />
    </div>
  )
}
