import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { skipToken } from '@reduxjs/toolkit/query/react'
import { useGetWorldQuery } from '../../services/experienceApi'
import { mediaUrl } from '../../services/media'
import type { LockedWorldDetail } from '../../types/api'
import { preloadLayout } from '../../worlds/registry'
import { formatRemaining, useUnlockCountdown } from './useUnlockCountdown'
import styles from './World.module.scss'

const PRELOAD_PHOTOS = 3

function warmImages(ids: readonly string[]): void {
  for (const id of ids) {
    const img = new Image()
    img.decoding = 'async'
    img.src = mediaUrl(id, 'medium')
  }
}

function LockedNote({ world }: { world: LockedWorldDetail }) {
  const r = useUnlockCountdown(world.unlockAt)
  return (
    <span className={styles.nextLock} role="timer">
      {r.done ? 'Opening now' : `Opens in ${formatRemaining(r)}`}
    </span>
  )
}

/**
 * "Next chapter" link. Once `active` (the outro is on screen) it fetches the next world, then warms its layout
 * chunk and first photos. A locked next world shows as a frosted teaser; the link still leads to its countdown.
 */
export function NextChapter({ slug, active }: { slug: string; active: boolean }) {
  const { data } = useGetWorldQuery(active ? slug : skipToken)

  useEffect(() => {
    if (!data || data.locked) return
    preloadLayout(data.layout)
    warmImages(data.moments.slice(0, PRELOAD_PHOTOS).map((m) => m.media.mediaId))
  }, [data])

  const locked = data?.locked === true
  return (
    <Link to={`/world/${slug}`} className={styles.next} data-locked={locked || undefined}>
      <span className={styles.nextLabel}>Next chapter →</span>
      {data && <span className={styles.nextTitle}>{data.title}</span>}
      {data?.locked && <LockedNote world={data} />}
    </Link>
  )
}
