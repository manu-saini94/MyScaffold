import { useEffect, useState } from 'react'
import { useAppDispatch } from '../../app/hooks'
import { adminApi, useDeleteMediaMutation, useListWorldsQuery } from '../../services/adminApi'
import { MediaGrid } from './MediaGrid'
import { ConfirmButton, ProblemAlert } from './ui'
import { mediaUrl } from '../../services/media'
import styles from './Admin.module.scss'

/** Ids of every photo used by some world. The API has no unassigned filter yet, so it is computed here. */
function useAssignedMediaIds(enabled: boolean): Set<string> | null {
  const dispatch = useAppDispatch()
  const { data: worlds } = useListWorldsQuery(undefined, { skip: !enabled })
  const [assigned, setAssigned] = useState<Set<string> | null>(null)

  useEffect(() => {
    if (!enabled || !worlds) return
    let cancelled = false
    void Promise.all(
      worlds.map((w) =>
        dispatch(adminApi.endpoints.getMoments.initiate(w.id, { forceRefetch: true, subscribe: false })).unwrap(),
      ),
    )
      .then((lists) => {
        if (!cancelled) setAssigned(new Set(lists.flat().map((m) => m.mediaId)))
      })
      .catch(() => {
        if (!cancelled) setAssigned(null)
      })
    return () => {
      cancelled = true
    }
  }, [enabled, worlds, dispatch])

  return enabled ? assigned : null
}

export function LibraryPage() {
  const [unassignedOnly, setUnassignedOnly] = useState(false)
  const [remove, removal] = useDeleteMediaMutation()
  const assigned = useAssignedMediaIds(unassignedOnly)
  const filtering = unassignedOnly && assigned !== null

  return (
    <section className={styles.page} aria-labelledby="lib-h">
      <h1 id="lib-h">Library</h1>
      <label className={styles.check}>
        <input type="checkbox" checked={unassignedOnly} onChange={(e) => setUnassignedOnly(e.target.checked)} />
        Only photos not used in any world (this page)
      </label>
      <ProblemAlert error={removal.error} />
      <MediaGrid
        filter={filtering ? (m) => !assigned.has(m.id) : undefined}
        emptyText={filtering ? 'Every photo on this page is already in a world.' : 'No photos yet. Import some first.'}
        renderItem={(m) => (
          <div className={styles.cell}>
            <img
              className={styles.libThumb}
              src={mediaUrl(m.id, 'thumb')}
              alt={m.filename ?? 'Photo'}
              loading="lazy"
              width={120}
              height={120}
            />
            <span className={styles.muted}>{m.filename ?? m.id}</span>
            <ConfirmButton
              label="Delete"
              confirmLabel="Yes, delete photo"
              busy={removal.isLoading}
              onConfirm={() => void remove(m.id)}
            />
          </div>
        )}
      />
      <p className={styles.muted}>Deleting a photo also removes it from every world, cover and hero selection.</p>
    </section>
  )
}
