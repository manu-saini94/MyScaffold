import { Navigate, useParams } from 'react-router-dom'
import { skipToken } from '@reduxjs/toolkit/query/react'
import { useGetWorldQuery } from '../../services/experienceApi'
import { LockedTeaser } from './LockedTeaser'
import { OpenWorld } from './OpenWorld'
import { WorldFrame } from './WorldFrame'
import styles from './World.module.scss'

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

function errorStatus(error: unknown): unknown {
  return (error as { status?: unknown } | undefined)?.status
}

/**
 * Lazy route entry for /world/:slug, driven by GET /api/worlds/{slug}.
 * Unknown slug (404/400) -> home. Other failures -> retry in place (never a redirect). Locked -> teaser with a
 * countdown that refetches at zero. Open -> intro, layout, outro. A 401 is handled globally (back to the lock screen).
 */
export default function WorldRoute() {
  const { slug = '' } = useParams()
  const valid = SLUG.test(slug) && slug.length <= 64
  const { data, error, isError, isFetching, refetch } = useGetWorldQuery(valid ? slug : skipToken)

  const status = errorStatus(error)
  if (!valid || (!data && (status === 404 || status === 400))) return <Navigate to="/" replace />

  let content
  if (data?.locked) {
    content = <LockedTeaser key={data.unlockAt} world={data} onUnlockDue={refetch} />
  } else if (data) {
    content = <OpenWorld key={data.slug} world={data} />
  } else if (isError) {
    content = (
      <div role="alert" className={styles.notice}>
        <h1 id="world-title" className={styles.noticeTitle}>
          This chapter did not load.
        </h1>
        <button type="button" className={styles.cta} onClick={() => void refetch()} disabled={isFetching}>
          {isFetching ? 'Trying…' : 'Try again'}
        </button>
      </div>
    )
  } else {
    content = (
      <div className={styles.loading} role="status">
        <h1 id="world-title" className={styles.srOnly}>
          Opening chapter
        </h1>
        <span className={styles.loadingLine} aria-hidden="true" />
      </div>
    )
  }

  return (
    <WorldFrame slug={slug} accent={data?.themeAccent} musicUrl={data ? (data.locked ? null : data.musicUrl) : undefined}>
      {content}
    </WorldFrame>
  )
}
