import { Link } from 'react-router-dom'
import { HeartGlyph } from '../../components/WorldIcon/WorldGlyph'
import { splitTitle } from './orbContent'
import styles from './Hero.module.scss'

/** Shown until the payload arrives, so the hero never jumps. Matches the default appTitle in the contract. */
const FALLBACK_TITLE = 'Anvi ❤ Manu'

function TitleText({ title, shine }: { title: string; shine: boolean }) {
  const parts = splitTitle(title)
  if (!parts) return <>{title}</>
  return (
    <>
      {parts.left}
      {/* the shine copy keeps the heart's space but draws nothing there */}
      <HeartGlyph className={shine ? styles.heartSpace : styles.heart} />
      {parts.right}
    </>
  )
}

/** "Anvi ❤ Manu" in a rose-to-gold gradient with a beating heart and a sweeping glint; tagline in shimmering gold. */
export function Hero({ title, tagline }: { title: string | null; tagline: string | null }) {
  const text = title?.trim() || FALLBACK_TITLE
  const parts = splitTitle(text)
  return (
    // taps around the title play the golden sparkle burst instead of the global hearts (components/ClickEffects)
    <header className={styles.hero} data-click-effect="sparkle">
      <h1 className={styles.title} data-easter="title" aria-label={parts ? `${parts.left} and ${parts.right}` : text}>
        <span className={styles.base} aria-hidden="true">
          <TitleText title={text} shine={false} />
        </span>
        <span className={styles.shine} aria-hidden="true">
          <TitleText title={text} shine />
        </span>
      </h1>
      {tagline && <p className={styles.tagline}>{tagline}</p>}
      <Link to="/story" className={styles.play}>
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
        </svg>
        Play our story
      </Link>
    </header>
  )
}
