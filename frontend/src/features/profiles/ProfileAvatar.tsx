import { Rose } from '../../components/Rose/Rose'
import type { Profile } from '../../types/api'
import { monogram } from './profiles'
import styles from './ProfileGate.module.scss'

function HeartGlyph() {
  return (
    <svg viewBox="0 0 24 24" className={styles.heart} aria-hidden="true">
      <path
        d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Photo-less avatar: a monogram on a motif. The viewer gets a full rose behind her initial; the decoy a ring and a small heart. */
export function ProfileAvatar({ profile }: { profile: Profile }) {
  const isViewer = profile.role === 'viewer'
  return (
    <span className={styles.avatar} data-role={profile.role} aria-hidden="true">
      {isViewer ? <Rose variant="bloom" size="78%" className={styles.motif} /> : <span className={styles.rings} />}
      <span className={styles.monogram}>{monogram(profile.name)}</span>
      {!isViewer && <HeartGlyph />}
    </span>
  )
}
