import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useCreateWorldMutation,
  useDeleteWorldMutation,
  useUpdateWorldMutation,
} from '../../services/adminApi'
import type { ApiLayout } from '../../types/api'
import { MediaGrid, PickTile } from './MediaGrid'
import { MomentsEditor } from './MomentsEditor'
import { fieldErrors } from './problem'
import { ConfirmButton, Field, ProblemAlert } from './ui'
import { mediaUrl } from '../../services/media'
import { BUNDLED_SONGS } from '../../services/music'
import type { AdminWorld } from './types'
import {
  EMPTY_DRAFT,
  LAYOUTS,
  draftFromWorld,
  slugify,
  toWorldRequest,
  validateDraft,
  type WorldDraft,
} from './worldForm'
import styles from './Admin.module.scss'

/** Create (world omitted) or edit one world. Remounted per world through `key`, so the draft never leaks between worlds. */
export function WorldEditor({ world }: { world?: AdminWorld }) {
  const navigate = useNavigate()
  const [draft, setDraft] = useState<WorldDraft>(world ? draftFromWorld(world) : EMPTY_DRAFT)
  const [slugTouched, setSlugTouched] = useState(Boolean(world))
  const [picking, setPicking] = useState(false)
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [create, creation] = useCreateWorldMutation()
  const [update, updating] = useUpdateWorldMutation()
  const [remove, removal] = useDeleteWorldMutation()

  const saving = creation.isLoading || updating.isLoading
  const saveError = world ? updating.error : creation.error
  const errors = { ...fieldErrors(saveError), ...clientErrors }
  const layout = LAYOUTS.find((l) => l.value === draft.layout)

  const set = <K extends keyof WorldDraft>(key: K, value: WorldDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setSaved(false)
    setClientErrors((e) => (key in e ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== key)) : e))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const found = validateDraft(draft)
    setClientErrors(found)
    if (Object.keys(found).length > 0) return
    try {
      if (world) {
        await update({ id: world.id, body: toWorldRequest(draft) }).unwrap()
        setSaved(true)
      } else {
        const created = await create(toWorldRequest(draft)).unwrap()
        void navigate(`/admin/worlds/${created.id}`)
      }
    } catch {
      /* shown from saveError */
    }
  }

  const text = (key: 'title' | 'subtitle' | 'tagline', label: string, extra?: { wide?: boolean; hint?: string }) => (
    <Field label={label} error={errors[key]} hint={extra?.hint} className={extra?.wide ? styles.wide : undefined}>
      {(p) => (
        <input
          {...p}
          type="text"
          value={draft[key]}
          onChange={(e) => {
            set(key, e.target.value)
            if (key === 'title' && !slugTouched) set('slug', slugify(e.target.value))
          }}
        />
      )}
    </Field>
  )

  return (
    <div className={styles.page} style={{ padding: 0 }}>
      <form className={styles.panel} onSubmit={submit} noValidate aria-label={world ? 'Edit world' : 'New world'}>
        <h2>{world ? `Edit: ${world.title}` : 'New world'}</h2>
        <div className={styles.formGrid}>
          {text('title', 'Title')}
          <Field label="Slug" error={errors.slug} hint="Used in the address: /world/your-slug">
            {(p) => (
              <input
                {...p}
                type="text"
                value={draft.slug}
                onChange={(e) => {
                  setSlugTouched(true)
                  set('slug', e.target.value)
                }}
              />
            )}
          </Field>
          {text('subtitle', 'Subtitle')}
          {text('tagline', 'Tagline')}
          <Field label="Layout" error={errors.layout}>
            {(p) => (
              <select {...p} value={draft.layout} onChange={(e) => set('layout', e.target.value as ApiLayout)}>
                {LAYOUTS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <p className={styles.muted} aria-live="polite" data-testid="layout-preview">
            <strong>{layout?.label}:</strong> {layout?.blurb}
          </p>
          <Field label="Accent colour" error={errors.themeAccent} hint="Hex like #b3122f. Empty uses the theme colour.">
            {(p) => (
              <span className={styles.row}>
                <input {...p} type="text" value={draft.themeAccent} onChange={(e) => set('themeAccent', e.target.value)} />
                <input
                  type="color"
                  aria-label="Pick accent colour"
                  value={/^#[0-9a-fA-F]{6}$/.test(draft.themeAccent) ? draft.themeAccent : '#b3122f'}
                  onChange={(e) => set('themeAccent', e.target.value)}
                />
              </span>
            )}
          </Field>
          <Field label="Unlocks at" error={errors.unlockAt} hint="Empty means always open. Your local time.">
            {(p) => <input {...p} type="datetime-local" value={draft.unlockAt} onChange={(e) => set('unlockAt', e.target.value)} />}
          </Field>
          <Field label="Music" error={errors.musicUrl} hint="Paste an https:// link to an audio file (mp3, m4a, ogg).">
            {(p) => (
              <>
                <input {...p} type="text" list="bundled-songs" value={draft.musicUrl} onChange={(e) => set('musicUrl', e.target.value)} />
                <datalist id="bundled-songs">
                  {BUNDLED_SONGS.map((song) => (
                    <option key={song.path} value={song.path} label={song.label} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <Field label="Intro text" error={errors.introText} className={styles.wide}>
            {(p) => <textarea {...p} value={draft.introText} onChange={(e) => set('introText', e.target.value)} />}
          </Field>
          <Field label="Outro text" error={errors.outroText} className={styles.wide}>
            {(p) => <textarea {...p} value={draft.outroText} onChange={(e) => set('outroText', e.target.value)} />}
          </Field>
          <div className={`${styles.field} ${styles.wide}`}>
            <span id="cover-label">Cover photo</span>
            <div className={styles.row}>
              {draft.coverMediaId ? (
                <img className={styles.thumb} src={mediaUrl(draft.coverMediaId, 'thumb')} alt="Current cover" width={80} height={80} />
              ) : (
                <span className={styles.muted}>No cover (the first photo is used).</span>
              )}
              <button type="button" className={styles.btnGhost} aria-expanded={picking} aria-describedby="cover-label" onClick={() => setPicking(!picking)}>
                {picking ? 'Close library' : 'Choose cover'}
              </button>
              {draft.coverMediaId && (
                <button type="button" className={styles.btnGhost} onClick={() => set('coverMediaId', '')}>
                  Remove cover
                </button>
              )}
            </div>
            {errors.coverMediaId && <span className={styles.fieldError}>{errors.coverMediaId}</span>}
            {picking && (
              <MediaGrid
                renderItem={(m) => (
                  <PickTile
                    media={m}
                    selected={draft.coverMediaId === m.id}
                    onPick={(picked) => {
                      set('coverMediaId', picked.id)
                      setPicking(false)
                    }}
                  />
                )}
              />
            )}
          </div>
          <label className={`${styles.row} ${styles.wide}`}>
            <input type="checkbox" checked={draft.published} onChange={(e) => set('published', e.target.checked)} />
            Published (visible to Anvi)
          </label>
        </div>
        <ProblemAlert error={saveError} />
        <div className={styles.row}>
          <button type="submit" className={styles.btn} disabled={saving}>
            {saving ? 'Saving...' : world ? 'Save world' : 'Create world'}
          </button>
          {saved && (
            <span role="status" className={styles.ok}>
              World saved.
            </span>
          )}
          {world && (
            <ConfirmButton
              label="Delete world"
              confirmLabel={`Yes, delete (${world.momentCount} moments)`}
              busy={removal.isLoading}
              onConfirm={() => void remove(world.id).unwrap().then(() => navigate('/admin/worlds'), () => undefined)}
            />
          )}
        </div>
        <ProblemAlert error={removal.error} />
        {world && <p className={styles.muted}>Deleting removes its moments. Letters are kept without a world.</p>}
      </form>
      {world && <MomentsEditor worldId={world.id} />}
    </div>
  )
}
