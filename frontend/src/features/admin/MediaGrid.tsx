import { useState, type ReactNode } from 'react'
import { useListMediaQuery } from '../../services/adminApi'
import type { AdminMedia } from './types'
import { ProblemAlert, thumbUrl } from './ui'
import styles from './Admin.module.scss'

export const MEDIA_PAGE_SIZE = 60

interface MediaGridProps {
  /** Renders one library photo; return the tile. Receives the photo and its index on the page. */
  renderItem: (media: AdminMedia) => ReactNode
  /** Optional page filter (e.g. unassigned only). Applies to the loaded page. */
  filter?: (media: AdminMedia) => boolean
  emptyText?: string
}

/** Paged library grid shared by the library screen and every "choose from library" panel. */
export function MediaGrid({ renderItem, filter, emptyText = 'No photos yet.' }: MediaGridProps) {
  const [page, setPage] = useState(0)
  const { data, error, isFetching } = useListMediaQuery({ page, size: MEDIA_PAGE_SIZE })
  if (error) return <ProblemAlert error={error} />
  if (!data) return <p className={styles.muted}>Loading photos...</p>

  const items = filter ? data.items.filter(filter) : data.items
  const pages = Math.max(1, Math.ceil(data.total / data.size))
  return (
    <div className={styles.panel} aria-busy={isFetching}>
      {items.length === 0 ? (
        <p className={styles.muted}>{emptyText}</p>
      ) : (
        <ul className={styles.grid}>
          {items.map((m) => (
            <li key={m.id}>{renderItem(m)}</li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <div className={styles.row}>
          <button type="button" className={styles.btnGhost} disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span className={styles.muted}>
            Page {page + 1} of {pages} ({data.total} photos)
          </span>
          <button
            type="button"
            className={styles.btnGhost}
            disabled={page + 1 >= pages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

/** A pressable thumbnail for choosing photos. */
export function PickTile({
  media,
  selected,
  disabled,
  onPick,
}: {
  media: AdminMedia
  selected?: boolean
  disabled?: boolean
  onPick: (media: AdminMedia) => void
}) {
  const name = media.filename ?? media.id
  return (
    <button
      type="button"
      className={styles.tile}
      aria-pressed={selected ?? false}
      aria-label={name}
      disabled={disabled}
      onClick={() => onPick(media)}
    >
      <img src={thumbUrl(media.id)} alt="" loading="lazy" width={120} height={120} />
    </button>
  )
}
