import { Rose } from './Rose'
import styles from './RoseDecor.module.scss'

/** Corner sprigs + centre watermark. Purely decorative; hidden on the Cinema theme via tokens. */
export function RoseDecor() {
  return (
    <div className={styles.decor} aria-hidden="true">
      <Rose variant="sprig" size="min(46vw, 380px)" className={styles.topLeft} />
      <Rose variant="sprig" size="min(40vw, 320px)" className={styles.bottomRight} />
      <Rose variant="bloom" size="min(100vw, 820px)" className={styles.watermark} />
    </div>
  )
}
