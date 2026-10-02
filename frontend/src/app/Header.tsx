import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle'
import styles from './Header.module.scss'

/** App chrome over the home and worlds. The "Anvi ❤ Manu" title lives in the home hero (features/launcher/Hero). */
export function Header() {
  return (
    <header className={styles.header}>
      <ThemeToggle />
    </header>
  )
}
