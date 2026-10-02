/** Wire shapes of the admin API, mirrored from docs/api-contract.md section 4. */
import type { ApiLayout } from '../../types/api'

export interface AdminMe {
  email: string
  name: string | null
  admin: true
  pickerConnected: boolean
}

export interface PollingConfig {
  pollIntervalMs: number
  timeoutMs: number
}

export interface PickerSession {
  sessionId: string
  pickerUri: string
  pollingConfig: PollingConfig | null
  expireTime: string | null
}

export interface PickerSessionStatus {
  mediaItemsSet: boolean
  pollingConfig: PollingConfig | null
  expireTime: string | null
}

export interface ImportFailure {
  filename: string | null
  outcome: string
  reason: string | null
}

export interface ImportJob {
  jobId: string
  status: 'RUNNING' | 'COMPLETED' | 'FAILED'
  total: number
  done: number
  failed: number
  skipped: number
  error: string | null
  startedAt: string | null
  finishedAt: string | null
  failures: ImportFailure[]
}

export interface AdminMedia {
  id: string
  filename: string | null
  mimeType: string
  width: number | null
  height: number | null
  takenAt: string | null
  lqip: string | null
  dominantColor: string | null
  importedAt: string
}

export interface MediaPage {
  items: AdminMedia[]
  page: number
  size: number
  total: number
}

export interface AdminWorld {
  id: string
  slug: string
  title: string
  subtitle: string | null
  tagline: string | null
  layout: ApiLayout
  coverMediaId: string | null
  themeAccent: string | null
  sortOrder: number
  unlockAt: string | null
  introText: string | null
  outroText: string | null
  musicUrl: string | null
  published: boolean
  momentCount: number
  createdAt: string
  updatedAt: string
}

/** Body of POST and PUT /api/admin/worlds. `unlockAt: null` clears the lock on PUT; `published` omitted keeps it. */
export interface WorldRequest {
  slug: string
  title: string
  subtitle: string | null
  tagline: string | null
  layout: ApiLayout
  coverMediaId: string | null
  themeAccent: string | null
  unlockAt: string | null
  introText: string | null
  outroText: string | null
  musicUrl: string | null
  published: boolean
}

export interface AdminMoment {
  id: string
  mediaId: string
  caption: string | null
  note: string | null
  happenedOn: string | null
  place: string | null
  sortOrder: number
  favourite: boolean
  mimeType: string
  width: number | null
  height: number | null
  lqip: string | null
  dominantColor: string | null
  takenAt: string | null
}

export interface MomentInput {
  mediaId: string
  caption: string | null
  note: string | null
  happenedOn: string | null
  place: string | null
  favourite: boolean
}

export type RevealTrigger = 'WORLD_OUTRO' | 'SEALED_ICON'

export interface AdminLetter {
  id: string
  worldId: string | null
  title: string
  body: string
  revealTrigger: RevealTrigger
  sortOrder: number
  createdAt: string
}

export interface LetterRequest {
  worldId: string | null
  title: string
  body: string
  revealTrigger: RevealTrigger
}

export interface AdminSettings {
  appTitle: string
  tagline: string
  defaultTheme: 'rose' | 'cinema'
  specialDate: string
  herName: string
  myName: string
  easterEggNicknames: string[]
  heroMediaIds: string[]
  unlockQuestion: string
  unlockAnswersConfigured: number
}

/** Partial update. `unlockAnswers` is write-only: the server never returns it. */
export type SettingsUpdate = Partial<Omit<AdminSettings, 'unlockAnswersConfigured'>> & { unlockAnswers?: string[] }
