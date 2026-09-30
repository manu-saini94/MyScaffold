import { HeartGlyph } from '../components/WorldIcon/WorldGlyph'
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle'
import styles from './Header.module.scss'

export function Header() {
  return (
    <header className={styles.header}>
      <p className={styles.brand} aria-label="Anvi and Manu">
        <span>Anvi</span>
        <HeartGlyph className={styles.heart} />
        <span>Manu</span>
      </p>
      <ThemeToggle />
    </header>
  )
}
