import { useState, type FormEvent } from 'react'
import {
  useGetSettingsQuery,
  useResetRateLimitsMutation,
  useSignOutEveryoneMutation,
  useUpdateSettingsMutation,
} from '../../services/adminApi'
import { MediaGrid, PickTile } from './MediaGrid'
import { fieldErrors } from './problem'
import { ConfirmButton, Field, ProblemAlert } from './ui'
import { mediaUrl } from '../../services/media'
import type { AdminSettings, SettingsUpdate } from './types'
import styles from './Admin.module.scss'

const MAX_HERO = 10

/** One answer per line; blank lines dropped. Never pre-filled: the server does not return answers. */
export function parseAnswers(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

interface Draft {
  appTitle: string
  tagline: string
  defaultTheme: 'rose' | 'cinema'
  specialDate: string
  unlockQuestion: string
  answers: string
  heroMediaIds: string[]
}

function SettingsForm({ settings }: { settings: AdminSettings }) {
  const [draft, setDraft] = useState<Draft>({
    appTitle: settings.appTitle,
    tagline: settings.tagline,
    defaultTheme: settings.defaultTheme,
    specialDate: settings.specialDate,
    unlockQuestion: settings.unlockQuestion ?? '',
    answers: '',
    heroMediaIds: settings.heroMediaIds,
  })
  const [picking, setPicking] = useState(false)
  const [saved, setSaved] = useState(false)
  const [update, updating] = useUpdateSettingsMutation()
  const errors = fieldErrors(updating.error)

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setSaved(false)
  }
  const toggleHero = (id: string) =>
    set('heroMediaIds', draft.heroMediaIds.includes(id) ? draft.heroMediaIds.filter((h) => h !== id) : [...draft.heroMediaIds, id].slice(0, MAX_HERO))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const body: SettingsUpdate = {
      appTitle: draft.appTitle,
      tagline: draft.tagline,
      defaultTheme: draft.defaultTheme,
      heroMediaIds: draft.heroMediaIds,
    }
    if (draft.specialDate) body.specialDate = draft.specialDate
    const question = draft.unlockQuestion.trim()
    if (question && draft.unlockQuestion !== (settings.unlockQuestion ?? '')) body.unlockQuestion = question
    const answers = parseAnswers(draft.answers)
    if (answers.length > 0) body.unlockAnswers = answers
    try {
      await update(body).unwrap()
      setDraft((d) => ({ ...d, answers: '' }))
      setSaved(true)
    } catch {
      /* shown below */
    }
  }

  return (
    <form className={styles.panel} onSubmit={submit} noValidate aria-label="Settings">
      <div className={styles.formGrid}>
        <Field label="App title" error={errors.appTitle}>
          {(p) => <input {...p} type="text" value={draft.appTitle} onChange={(e) => set('appTitle', e.target.value)} />}
        </Field>
        <Field label="Tagline" error={errors.tagline}>
          {(p) => <input {...p} type="text" value={draft.tagline} onChange={(e) => set('tagline', e.target.value)} />}
        </Field>
        <Field label="Default theme" error={errors.defaultTheme}>
          {(p) => (
            <select {...p} value={draft.defaultTheme} onChange={(e) => set('defaultTheme', e.target.value === 'cinema' ? 'cinema' : 'rose')}>
              <option value="rose">Rose</option>
              <option value="cinema">Cinema</option>
            </select>
          )}
        </Field>
        <Field label="Special date" error={errors.specialDate}>
          {(p) => <input {...p} type="date" value={draft.specialDate} onChange={(e) => set('specialDate', e.target.value)} />}
        </Field>
        <Field
          label="Unlock question"
          error={errors.unlockQuestion}
          hint="Changing the question or the answers signs every viewer out."
          className={styles.wide}
        >
          {(p) => <input {...p} type="text" value={draft.unlockQuestion} onChange={(e) => set('unlockQuestion', e.target.value)} />}
        </Field>
        <Field
          label="New unlock answers (one per line)"
          error={errors.unlockAnswers}
          hint={`${settings.unlockAnswersConfigured} answers are set. Answers are never shown. Leave empty to keep them; typing here replaces all of them.`}
          className={styles.wide}
        >
          {(p) => (
            <textarea
              {...p}
              rows={3}
              autoComplete="off"
              spellCheck={false}
              value={draft.answers}
              placeholder="At least 4 characters each"
              onChange={(e) => set('answers', e.target.value)}
            />
          )}
        </Field>
        <div className={`${styles.field} ${styles.wide}`}>
          <span>
            Hero photos ({draft.heroMediaIds.length} of {MAX_HERO})
          </span>
          <div className={styles.row}>
            {draft.heroMediaIds.map((id) => (
              <button key={id} type="button" className={styles.tile} style={{ width: '5rem' }} aria-label={`Remove hero photo ${id}`} onClick={() => toggleHero(id)}>
                <img src={mediaUrl(id, 'thumb')} alt="" width={80} height={80} />
              </button>
            ))}
            <button type="button" className={styles.btnGhost} aria-expanded={picking} onClick={() => setPicking(!picking)}>
              {picking ? 'Close library' : 'Choose hero photos'}
            </button>
          </div>
          {errors.heroMediaIds && <span className={styles.fieldError}>{errors.heroMediaIds}</span>}
          {picking && (
            <MediaGrid
              renderItem={(m) => (
                <PickTile
                  media={m}
                  selected={draft.heroMediaIds.includes(m.id)}
                  disabled={!draft.heroMediaIds.includes(m.id) && draft.heroMediaIds.length >= MAX_HERO}
                  onPick={(picked) => toggleHero(picked.id)}
                />
              )}
            />
          )}
        </div>
      </div>
      <ProblemAlert error={updating.error} />
      <div className={styles.row}>
        <button type="submit" className={styles.btn} disabled={updating.isLoading}>
          {updating.isLoading ? 'Saving...' : 'Save settings'}
        </button>
        {saved && (
          <span role="status" className={styles.ok}>
            Settings saved.
          </span>
        )}
      </div>
    </form>
  )
}

function SecurityActions() {
  const [signOut, signingOut] = useSignOutEveryoneMutation()
  const [reset, resetting] = useResetRateLimitsMutation()
  return (
    <div className={styles.panel}>
      <h2>Access</h2>
      <div className={styles.row}>
        <ConfirmButton
          label="Sign out everyone"
          confirmLabel="Yes, sign everyone out"
          busy={signingOut.isLoading}
          onConfirm={() => void signOut()}
        />
        <button type="button" className={styles.btnGhost} disabled={resetting.isLoading} onClick={() => void reset()}>
          Reset unlock lockouts
        </button>
      </div>
      {signingOut.isSuccess && <p role="status" className={styles.ok}>Every viewer is signed out.</p>}
      {resetting.isSuccess && <p role="status" className={styles.ok}>Unlock attempt counters cleared.</p>}
      <ProblemAlert error={signingOut.error ?? resetting.error} />
    </div>
  )
}

export function SettingsPage() {
  const { data, error } = useGetSettingsQuery()
  return (
    <section className={styles.page} aria-labelledby="settings-h">
      <h1 id="settings-h">Settings</h1>
      <ProblemAlert error={error} />
      {data ? <SettingsForm settings={data} /> : !error && <p className={styles.muted}>Loading settings...</p>}
      <SecurityActions />
    </section>
  )
}
