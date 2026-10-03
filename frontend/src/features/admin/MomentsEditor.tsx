import { useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useGetMomentsQuery, useReplaceMomentsMutation } from '../../services/adminApi'
import { MediaGrid, PickTile } from './MediaGrid'
import { fromMedia, fromServer, move, toMomentInputs, type EditableMoment } from './momentsModel'
import { fieldErrors, readAdminProblem } from './problem'
import { ProblemAlert } from './ui'
import { mediaUrl } from '../../services/media'
import styles from './Admin.module.scss'

const MAX_MOMENTS = 500

interface RowProps {
  item: EditableMoment
  index: number
  count: number
  errors: Record<string, string>
  onChange: (patch: Partial<EditableMoment>) => void
  onMove: (to: number) => void
  onRemove: () => void
}

function MomentRow({ item, index, count, errors, onChange, onMove, onRemove }: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.key,
  })
  const at = `moments[${index}]`
  const err = (field: string) => errors[`${at}.${field}`]
  const label = (text: string) => `${text} (photo ${index + 1})`
  return (
    <li
      ref={setNodeRef}
      className={styles.moment}
      data-dragging={isDragging}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className={styles.momentSide}>
        <img className={styles.thumb} src={mediaUrl(item.mediaId, 'thumb')} alt="" width={80} height={80} loading="lazy" />
        <button
          type="button"
          ref={setActivatorNodeRef}
          className={styles.btnGhost}
          aria-label={label('Drag to reorder')}
          {...attributes}
          {...listeners}
        >
          Drag
        </button>
        <span className={styles.row}>
          <button type="button" className={styles.btnGhost} aria-label={label('Move up')} disabled={index === 0} onClick={() => onMove(index - 1)}>
            Up
          </button>
          <button type="button" className={styles.btnGhost} aria-label={label('Move down')} disabled={index === count - 1} onClick={() => onMove(index + 1)}>
            Down
          </button>
        </span>
      </div>
      <div className={styles.formGrid}>
        <div className={`${styles.field} ${styles.wide}`}>
          <label>
            {label('Caption')}
            <input
              type="text"
              value={item.caption}
              aria-invalid={Boolean(err('caption'))}
              onChange={(e) => onChange({ caption: e.target.value })}
            />
          </label>
          {err('caption') && <span className={styles.fieldError}>{err('caption')}</span>}
        </div>
        <div className={`${styles.field} ${styles.wide}`}>
          <label>
            {label('Note')}
            <textarea
              value={item.note}
              aria-invalid={Boolean(err('note'))}
              onChange={(e) => onChange({ note: e.target.value })}
            />
          </label>
          {err('note') && <span className={styles.fieldError}>{err('note')}</span>}
        </div>
        <div className={styles.field}>
          <label>
            {label('Date')}
            <input
              type="date"
              value={item.happenedOn}
              aria-invalid={Boolean(err('happenedOn'))}
              onChange={(e) => onChange({ happenedOn: e.target.value })}
            />
          </label>
          {err('happenedOn') && <span className={styles.fieldError}>{err('happenedOn')}</span>}
        </div>
        <div className={styles.field}>
          <label>
            {label('Place')}
            <input
              type="text"
              value={item.place}
              aria-invalid={Boolean(err('place'))}
              onChange={(e) => onChange({ place: e.target.value })}
            />
          </label>
          {err('place') && <span className={styles.fieldError}>{err('place')}</span>}
        </div>
        <label className={styles.row}>
          <input type="checkbox" checked={item.favourite} onChange={(e) => onChange({ favourite: e.target.checked })} />
          {label('Favourite')}
        </label>
        <div className={styles.row}>
          <button type="button" className={styles.btnDanger} aria-label={label('Remove')} onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>
    </li>
  )
}

function MomentsList({ worldId, initial, onReload }: { worldId: string; initial: EditableMoment[]; onReload: () => void }) {
  const [items, setItems] = useState(initial)
  const [adding, setAdding] = useState(false)
  const [saved, setSaved] = useState(false)
  const [replace, result] = useReplaceMomentsMutation()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const edit = (next: EditableMoment[]) => {
    setItems(next)
    result.reset()
    setSaved(false)
  }
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    edit(move(items, items.findIndex((i) => i.key === active.id), items.findIndex((i) => i.key === over.id)))
  }
  const toggleMedia = (media: Parameters<typeof fromMedia>[0]) => {
    edit(items.some((i) => i.mediaId === media.id) ? items.filter((i) => i.mediaId !== media.id) : [...items, fromMedia(media)])
  }
  const save = async () => {
    try {
      await replace({ worldId, moments: toMomentInputs(items) }).unwrap()
      setSaved(true)
    } catch {
      /* shown below */
    }
  }

  const problem = readAdminProblem(result.error)
  const conflict = problem?.code === 'moments-conflict'
  const tooMany = items.length > MAX_MOMENTS
  return (
    <div className={styles.panel}>
      <h2>Moments ({items.length})</h2>
      <div className={styles.row}>
        <button type="button" className={styles.btnGhost} aria-expanded={adding} onClick={() => setAdding(!adding)}>
          {adding ? 'Close library' : 'Add photos from library'}
        </button>
        <button type="button" className={styles.btn} onClick={save} disabled={result.isLoading || tooMany}>
          {result.isLoading ? 'Saving...' : 'Save moments'}
        </button>
        {saved && <span role="status" className={styles.ok}>Moments saved.</span>}
      </div>
      {tooMany && <p role="alert" className={styles.fieldError}>At most {MAX_MOMENTS} moments per world.</p>}
      {conflict ? (
        <div role="alert" className={styles.alert}>
          <span>The world or its photos changed while you were editing. Reload to see the current moments; your unsaved edits will be lost.</span>
          <button type="button" className={styles.btn} onClick={onReload}>
            Reload moments
          </button>
        </div>
      ) : (
        <ProblemAlert error={result.error} />
      )}
      {adding && (
        <MediaGrid
          renderItem={(m) => (
            <PickTile media={m} selected={items.some((i) => i.mediaId === m.id)} onPick={toggleMedia} />
          )}
        />
      )}
      {items.length === 0 ? (
        <p className={styles.muted}>No moments yet. Add photos from the library.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((i) => i.key)} strategy={verticalListSortingStrategy}>
            <ol className={styles.moments} aria-label="Moments in display order">
              {items.map((item, index) => (
                <MomentRow
                  key={item.key}
                  item={item}
                  index={index}
                  count={items.length}
                  errors={fieldErrors(result.error)}
                  onChange={(patch) => edit(items.map((i) => (i.key === item.key ? { ...i, ...patch } : i)))}
                  onMove={(to) => edit(move(items, index, to))}
                  onRemove={() => edit(items.filter((i) => i.key !== item.key))}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}

/** Loads a world's moments and mounts the editor; `reload` refetches and discards unsaved edits. */
export function MomentsEditor({ worldId }: { worldId: string }) {
  const { data, error, refetch } = useGetMomentsQuery(worldId)
  const [version, setVersion] = useState(0)
  if (error) return <ProblemAlert error={error} />
  if (!data) return <p className={styles.muted}>Loading moments...</p>
  return (
    <MomentsList
      key={`${worldId}:${version}`}
      worldId={worldId}
      initial={data.map(fromServer)}
      onReload={() => {
        void refetch().then(() => setVersion((v) => v + 1))
      }}
    />
  )
}
