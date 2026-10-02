import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useGetExperienceQuery } from '../../services/experienceApi'
import { buildChapters } from './playlist'
import { StoryPlayer, type Clock } from './StoryPlayer'
import styles from './Story.module.scss'

const FALLBACK_TITLE = 'Anvi ❤ Manu'

/** /story: "Play our story". Its own lazy chunk; full screen, outside the home's chrome. */
export default function StoryRoute({ clock }: { clock?: Clock }) {
  const { data, isError, refetch } = useGetExperienceQuery()
  const chapters = useMemo(() => (data ? buildChapters(data.worlds) : null), [data])

  if (isError) {
    return (
      <div className={styles.stage}>
        <div className={styles.card} role="alert">
          <p className={styles.subtitle}>The story could not load.</p>
          <button type="button" className={styles.goldButton} onClick={() => void refetch()}>
            Try again
          </button>
          <Link to="/" className={styles.textButton}>
            Back home
          </Link>
        </div>
      </div>
    )
  }
  if (!data || !chapters) return <div className={styles.stage} aria-busy="true" />
  return <StoryPlayer chapters={chapters} appTitle={data.appTitle?.trim() || FALLBACK_TITLE} clock={clock} />
}
