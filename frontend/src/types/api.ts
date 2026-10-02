/**
 * Wire shapes of the viewer API, mirrored from docs/api-contract.md (sections 2 and 3).
 * Instants are ISO-8601 UTC strings; dates are YYYY-MM-DD.
 */

export type ApiLayout = 'POLAROID_TABLE' | 'FILM_STRIP' | 'POSTCARDS' | 'MEMORY_WALL' | 'ENVELOPE' | 'CONSTELLATION'

export interface MediaRef {
  mediaId: string
  width: number | null
  height: number | null
  lqip: string | null
  dominantColor: string | null
}

export interface Profile {
  id: string
  name: string
  role: 'viewer' | 'decoy'
}

interface WorldSummaryBase {
  slug: string
  title: string
  subtitle: string | null
  layout: ApiLayout
  themeAccent: string | null
  sortOrder: number
}

export interface OpenWorldSummary extends WorldSummaryBase {
  locked: false
  tagline: string | null
  momentCount: number
  cover: MediaRef | null
  previewMediaIds: string[]
}

/** Teaser only: the server sends no cover, count, preview or tagline for a locked world. */
export interface LockedWorldSummary extends WorldSummaryBase {
  locked: true
  unlockAt: string
}

export type WorldSummary = OpenWorldSummary | LockedWorldSummary

export interface Experience {
  serverTime: string
  appTitle: string
  tagline: string | null
  defaultTheme: 'rose' | 'cinema' | string
  specialDate: string | null
  easterEggNicknames: string[]
  profiles: Profile[]
  hero: MediaRef[]
  worlds: WorldSummary[]
  adminPreview?: true
}

export interface AuthStatus {
  unlocked: boolean
}

export interface AuthQuestion {
  question: string
}

/** RFC 7807 body. Extra members appear per case (see contract section 1.3). */
export interface Problem {
  type: string
  title: string
  status: number
  detail?: string
  attemptsRemaining?: number
  retryAfterSeconds?: number
  errors?: { field: string; message: string }[]
}

export interface MomentMedia extends MediaRef {
  mimeType: string
  takenAt: string | null
}

export interface Moment {
  id: string
  sortOrder: number
  caption: string | null
  note: string | null
  happenedOn: string | null
  place: string | null
  favourite: boolean
  media: MomentMedia
}

export interface Letter {
  id: string
  title: string
  /** RAW markdown. Render with a safe renderer only (contract 3.2). */
  body: string
  revealTrigger: 'WORLD_OUTRO' | 'SEALED_ICON'
}

/** GET /api/worlds/{slug}, open shape (also used for admins previewing a locked world). */
export interface OpenWorldDetail {
  slug: string
  title: string
  subtitle: string | null
  tagline: string | null
  layout: ApiLayout
  themeAccent: string | null
  locked: false
  introText: string | null
  outroText: string | null
  musicUrl: string | null
  nextSlug: string | null
  serverTime: string
  moments: Moment[]
  letters: Letter[]
  adminPreview?: true
}

/** GET /api/worlds/{slug} for a locked world (viewers): teaser only. */
export interface LockedWorldDetail {
  slug: string
  title: string
  subtitle: string | null
  layout: ApiLayout
  themeAccent: string | null
  locked: true
  unlockAt: string
  serverTime: string
}

export type WorldDetail = OpenWorldDetail | LockedWorldDetail
