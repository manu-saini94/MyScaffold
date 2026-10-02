import { useState, type FormEvent } from 'react'
import Markdown from 'react-markdown'
import {
  useCreateLetterMutation,
  useDeleteLetterMutation,
  useListLettersQuery,
  useListWorldsQuery,
  useUpdateLetterMutation,
} from '../../services/adminApi'
import { fieldErrors } from './problem'
import { ConfirmButton, Field, ProblemAlert } from './ui'
import type { AdminLetter, RevealTrigger } from './types'
import styles from './Admin.module.scss'

const MAX_BODY = 20000
const MAX_TITLE = 160

interface Draft {
  title: string
  body: string
  worldId: string
  revealTrigger: RevealTrigger
}

const EMPTY: Draft = { title: '', body: '', worldId: '', revealTrigger: 'WORLD_OUTRO' }

function LetterForm({ letter, onDone }: { letter?: AdminLetter; onDone: () => void }) {
  const { data: worlds } = useListWorldsQuery()
  const [draft, setDraft] = useState<Draft>(
    letter ? { title: letter.title, body: letter.body, worldId: letter.worldId ?? '', revealTrigger: letter.revealTrigger } : EMPTY,
  )
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [create, creation] = useCreateLetterMutation()
  const [update, updating] = useUpdateLetterMutation()
  const [remove, removal] = useDeleteLetterMutation()
  const saveError = letter ? updating.error : creation.error
  const errors = { ...fieldErrors(saveError), ...clientErrors }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setSaved(false)
    setClientErrors({})
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const found: Record<string, string> = {}
    if (!draft.title.trim()) found.title = 'Title is required.'
    else if (draft.title.length > MAX_TITLE) found.title = `At most ${MAX_TITLE} characters.`
    if (draft.body.length > MAX_BODY) found.body = `At most ${MAX_BODY} characters.`
    setClientErrors(found)
    if (Object.keys(found).length > 0) return
    const body = {
      worldId: draft.worldId || null,
      title: draft.title.trim(),
      body: draft.body,
      revealTrigger: draft.revealTrigger,
    }
    try {
      if (letter) await update({ id: letter.id, body }).unwrap()
      else {
        await create(body).unwrap()
        onDone()
      }
      setSaved(true)
    } catch {
      /* shown from saveError */
    }
  }

  return (
    <form className={styles.panel} onSubmit={submit} noValidate aria-label={letter ? 'Edit letter' : 'New letter'}>
      <h2>{letter ? 'Edit letter' : 'New letter'}</h2>
      <div className={styles.formGrid}>
        <Field label="Title" error={errors.title}>
          {(p) => <input {...p} type="text" value={draft.title} onChange={(e) => set('title', e.target.value)} />}
        </Field>
        <Field label="World" error={errors.worldId} hint="Letters without a world are not shown to Anvi.">
          {(p) => (
            <select {...p} value={draft.worldId} onChange={(e) => set('worldId', e.target.value)}>
              <option value="">(none)</option>
              {worlds?.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Revealed by" error={errors.revealTrigger}>
          {(p) => (
            <select {...p} value={draft.revealTrigger} onChange={(e) => set('revealTrigger', e.target.value as RevealTrigger)}>
              <option value="WORLD_OUTRO">The end of the world</option>
              <option value="SEALED_ICON">A sealed icon</option>
            </select>
          )}
        </Field>
      </div>
      <div className={styles.splitEditor}>
        <Field label="Letter (markdown)" error={errors.body} hint={`${draft.body.length} / ${MAX_BODY}`}>
          {(p) => <textarea {...p} rows={12} value={draft.body} onChange={(e) => set('body', e.target.value)} />}
        </Field>
        <div className={styles.field}>
          <span id="preview-label">Preview</span>
          <div className={styles.preview} role="region" aria-labelledby="preview-label">
            {draft.body.trim() ? <Markdown>{draft.body}</Markdown> : <span className={styles.muted}>Nothing to preview yet.</span>}
          </div>
        </div>
      </div>
      <ProblemAlert error={saveError} />
      <div className={styles.row}>
        <button type="submit" className={styles.btn} disabled={creation.isLoading || updating.isLoading}>
          {letter ? 'Save letter' : 'Create letter'}
        </button>
        {saved && (
          <span role="status" className={styles.ok}>
            Letter saved.
          </span>
        )}
        {letter && (
          <ConfirmButton
            label="Delete letter"
            confirmLabel="Yes, delete letter"
            busy={removal.isLoading}
            onConfirm={() => void remove(letter.id).unwrap().then(onDone, () => undefined)}
          />
        )}
      </div>
      <ProblemAlert error={removal.error} />
    </form>
  )
}

export function LettersPage() {
  const { data: letters, error } = useListLettersQuery()
  const { data: worlds } = useListWorldsQuery()
  const [selected, setSelected] = useState<string | 'new' | null>(null)
  const current = letters?.find((l) => l.id === selected)
  const worldName = (id: string | null) => worlds?.find((w) => w.id === id)?.title ?? 'no world'

  return (
    <section className={styles.page} aria-labelledby="letters-h">
      <h1 id="letters-h">Letters</h1>
      <div className={styles.split}>
        <nav aria-label="Letters">
          <button type="button" className={styles.btn} onClick={() => setSelected('new')}>
            New letter
          </button>
          <ProblemAlert error={error} />
          <ul className={styles.list} style={{ marginTop: 'var(--space-3)' }}>
            {letters?.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  className={styles.listLink}
                  aria-current={selected === l.id ? 'page' : undefined}
                  onClick={() => setSelected(l.id)}
                  style={{ textAlign: 'left', cursor: 'pointer' }}
                >
                  {l.title} <span className={styles.muted}>({worldName(l.worldId)})</span>
                </button>
              </li>
            ))}
          </ul>
          {letters?.length === 0 && <p className={styles.muted}>No letters yet.</p>}
        </nav>
        {selected === 'new' && <LetterForm key="new" onDone={() => setSelected(null)} />}
        {current && <LetterForm key={current.id} letter={current} onDone={() => setSelected(null)} />}
        {!selected && <p className={styles.muted}>Choose a letter, or write a new one.</p>}
      </div>
    </section>
  )
}
