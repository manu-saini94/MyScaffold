import { useEffect, useState } from 'react'
import { useAppDispatch } from '../../app/hooks'
import { adminApi, useCreatePickerSessionMutation, useStartImportMutation } from '../../services/adminApi'
import { QrCode } from './QrCode'
import { ProblemAlert } from './ui'
import { readAdminProblem } from './problem'
import { usePoll } from './usePoll'
import type { PickerSession } from './types'
import styles from './Admin.module.scss'

const MIN_POLL_MS = 500
const JOB_POLL_MS = 1000

function ReconnectLink({ error }: { error: unknown }) {
  const problem = readAdminProblem(error)
  if (problem?.code !== 'google-reconnect-required' || !problem.authorizeUrl) return null
  return (
    <p>
      <a className={styles.btn} href={problem.authorizeUrl}>
        Reconnect Google Photos
      </a>
    </p>
  )
}

function JobProgress({ jobId }: { jobId: string }) {
  const dispatch = useAppDispatch()
  const { data, error } = usePoll(
    async () => {
      const r = await dispatch(adminApi.endpoints.getImportJob.initiate(jobId, { forceRefetch: true, subscribe: false }))
      return { data: r.data, error: r.error }
    },
    (job) => (job.status === 'RUNNING' ? JOB_POLL_MS : null),
  )
  const status = data?.status
  useEffect(() => {
    if (status && status !== 'RUNNING') dispatch(adminApi.util.invalidateTags(['AdminMedia']))
  }, [status, dispatch])

  if (!data) return error ? <ProblemAlert error={error} /> : <p aria-live="polite">Starting import...</p>
  const handled = data.done + data.failed + data.skipped
  const ratio = data.total > 0 ? Math.min(1, handled / data.total) : 0
  const heading = { RUNNING: 'Import running', COMPLETED: 'Import finished', FAILED: 'Import failed' }[data.status]
  return (
    <div className={styles.panel}>
      <h2>{heading}</h2>
      <div
        className={styles.progress}
        role="progressbar"
        aria-label="Import progress"
        aria-valuemin={0}
        aria-valuemax={data.total}
        aria-valuenow={handled}
      >
        <div style={{ transform: `scaleX(${ratio})` }} />
      </div>
      <p aria-live="polite">
        {data.done} imported, {data.skipped} skipped, {data.failed} failed of {data.total}
      </p>
      {data.error && (
        <p role="alert" className={styles.fieldError}>
          {data.error}
        </p>
      )}
      {data.failures.length > 0 && (
        <ul className={styles.muted}>
          {data.failures.map((f, i) => (
            <li key={i}>
              {f.filename ?? 'unknown file'}: {f.reason ?? f.outcome}
            </li>
          ))}
        </ul>
      )}
      <ProblemAlert error={error} />
    </div>
  )
}

/** One picker session: link + QR, polling at the server's pace, then the import button. Mounted per session. */
function PickerStep({ session, onStarted }: { session: PickerSession; onStarted: (jobId: string) => void }) {
  const dispatch = useAppDispatch()
  const [startImport, start] = useStartImportMutation()
  const [startedAt] = useState(() => Date.now())
  const { data, error, stopped } = usePoll(
    async () => {
      const r = await dispatch(
        adminApi.endpoints.getPickerSession.initiate(session.sessionId, { forceRefetch: true, subscribe: false }),
      )
      return { data: r.data, error: r.error }
    },
    (status) => {
      if (status.mediaItemsSet) return null
      const config = status.pollingConfig ?? session.pollingConfig
      if (config && Date.now() - startedAt > config.timeoutMs) return null
      return Math.max(MIN_POLL_MS, config?.pollIntervalMs ?? MIN_POLL_MS)
    },
  )
  const picked = data?.mediaItemsSet === true
  const timedOut = stopped && !picked && !error

  const run = async () => {
    try {
      onStarted((await startImport(session.sessionId).unwrap()).jobId)
    } catch {
      /* shown from start.error */
    }
  }

  return (
    <div className={styles.panel}>
      <h2>1. Choose photos</h2>
      <div className={styles.row}>
        <QrCode value={session.pickerUri} label="QR code for the Google Photos picker link" />
        <p>
          <a className={styles.btnGhost} href={session.pickerUri} target="_blank" rel="noreferrer noopener">
            Open the picker
          </a>
        </p>
      </div>
      <p aria-live="polite" className={styles.muted}>
        {picked
          ? 'Photos chosen. Ready to import.'
          : timedOut
            ? 'The picker session timed out. Create a new one.'
            : 'Waiting for your selection...'}
      </p>
      <ProblemAlert error={error} />
      <ReconnectLink error={error} />
      <h2>2. Import</h2>
      <div className={styles.row}>
        <button type="button" className={styles.btn} onClick={run} disabled={!picked || start.isLoading}>
          Start import
        </button>
      </div>
      <ProblemAlert error={start.error} />
      <ReconnectLink error={start.error} />
    </div>
  )
}

export function ImportPage() {
  const [createSession, create] = useCreatePickerSessionMutation()
  const [session, setSession] = useState<PickerSession | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)

  const begin = async () => {
    setJobId(null)
    setSession(null)
    try {
      setSession(await createSession().unwrap())
    } catch {
      /* shown from create.error */
    }
  }

  return (
    <section className={styles.page} aria-labelledby="import-h">
      <h1 id="import-h">Import from Google Photos</h1>
      <p className={styles.muted}>Create a picker session, open it on any device, choose photos, then start the import.</p>
      <div className={styles.row}>
        <button type="button" className={styles.btn} onClick={begin} disabled={create.isLoading}>
          {session ? 'New picker session' : 'Create picker session'}
        </button>
      </div>
      <ProblemAlert error={create.error} />
      <ReconnectLink error={create.error} />

      {session && !jobId && <PickerStep key={session.sessionId} session={session} onStarted={setJobId} />}
      {jobId && <JobProgress key={jobId} jobId={jobId} />}
    </section>
  )
}
