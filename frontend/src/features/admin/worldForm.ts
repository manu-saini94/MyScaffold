import { isMusicUrl } from '../../services/music'
import type { ApiLayout } from '../../types/api'
import type { AdminWorld, WorldRequest } from './types'

export const LAYOUTS: { value: ApiLayout; label: string; blurb: string }[] = [
  { value: 'POLAROID_TABLE', label: 'Polaroid table', blurb: 'Instant prints scattered on a table.' },
  { value: 'FILM_STRIP', label: 'Film strip', blurb: 'A horizontal reel of frames.' },
  { value: 'POSTCARDS', label: 'Postcards', blurb: 'Postcards with captions and a place.' },
  { value: 'MEMORY_WALL', label: 'Memory wall', blurb: 'A dense wall of photos, tidy and wide.' },
  { value: 'ENVELOPE', label: 'Envelope', blurb: 'Photos tucked in an envelope, opened one by one.' },
  { value: 'CONSTELLATION', label: 'Constellation', blurb: 'Photos as stars joined into a sky.' },
]

/** The form's working copy. Every field is a string so inputs stay controlled; `unlockAt` is a local datetime. */
export interface WorldDraft {
  title: string
  subtitle: string
  tagline: string
  slug: string
  layout: ApiLayout
  coverMediaId: string
  themeAccent: string
  unlockAt: string
  /** The server's instant for `unlockAt`; kept so an untouched input does not drop its seconds. */
  unlockAtSource: string | null
  introText: string
  outroText: string
  musicUrl: string
  published: boolean
}

export const EMPTY_DRAFT: WorldDraft = {
  title: '',
  subtitle: '',
  tagline: '',
  slug: '',
  layout: 'POLAROID_TABLE',
  coverMediaId: '',
  themeAccent: '',
  unlockAt: '',
  unlockAtSource: null,
  introText: '',
  outroText: '',
  musicUrl: '',
  published: true,
}

const pad = (n: number) => String(n).padStart(2, '0')

/** ISO instant -> value for <input type="datetime-local"> in the browser's zone. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** <input type="datetime-local"> value -> ISO instant, or null when empty or invalid. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function draftFromWorld(world: AdminWorld): WorldDraft {
  return {
    title: world.title,
    subtitle: world.subtitle ?? '',
    tagline: world.tagline ?? '',
    slug: world.slug,
    layout: world.layout,
    coverMediaId: world.coverMediaId ?? '',
    themeAccent: world.themeAccent ?? '',
    unlockAt: toLocalInput(world.unlockAt),
    unlockAtSource: world.unlockAt,
    introText: world.introText ?? '',
    outroText: world.outroText ?? '',
    musicUrl: world.musicUrl ?? '',
    published: world.published,
  }
}

/** datetime-local has minutes only: while the input still equals the loaded value, keep the original instant. */
function unlockInstant(draft: WorldDraft): string | null {
  if (draft.unlockAtSource && draft.unlockAt === toLocalInput(draft.unlockAtSource)) return draft.unlockAtSource
  return fromLocalInput(draft.unlockAt)
}

const orNull = (value: string): string | null => (value.trim() === '' ? null : value.trim())

/** PUT replaces omitted fields, so everything is always sent; `unlockAt: null` means always open. */
export function toWorldRequest(draft: WorldDraft): WorldRequest {
  return {
    slug: draft.slug.trim(),
    title: draft.title.trim(),
    subtitle: orNull(draft.subtitle),
    tagline: orNull(draft.tagline),
    layout: draft.layout,
    coverMediaId: orNull(draft.coverMediaId),
    themeAccent: orNull(draft.themeAccent),
    unlockAt: unlockInstant(draft),
    introText: orNull(draft.introText),
    outroText: orNull(draft.outroText),
    musicUrl: orNull(draft.musicUrl),
    published: draft.published,
  }
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const ACCENT = /^#[0-9a-fA-F]{6}$/

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '')
}

/** Client-side checks that mirror the server rules; the server stays the authority. */
export function validateDraft(draft: WorldDraft): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!draft.title.trim()) errors.title = 'Title is required.'
  else if (draft.title.trim().length > 120) errors.title = 'Title can be at most 120 characters.'
  if (!draft.slug.trim()) errors.slug = 'Slug is required.'
  else if (draft.slug.trim().length > 64 || !SLUG.test(draft.slug.trim()))
    errors.slug = 'Use lowercase letters, digits and single hyphens (max 64).'
  if (draft.subtitle.length > 200) errors.subtitle = 'At most 200 characters.'
  if (draft.tagline.length > 200) errors.tagline = 'At most 200 characters.'
  if (draft.introText.length > 2000) errors.introText = 'At most 2000 characters.'
  if (draft.outroText.length > 2000) errors.outroText = 'At most 2000 characters.'
  if (draft.themeAccent && !ACCENT.test(draft.themeAccent)) errors.themeAccent = 'Use a colour like #b3122f.'
  if (draft.musicUrl.trim() && !isMusicUrl(draft.musicUrl.trim()))
    errors.musicUrl = 'Use an https:// link or a song path like /assets/music/your-song.mp3'
  if (draft.unlockAt && fromLocalInput(draft.unlockAt) === null) errors.unlockAt = 'Not a valid date and time.'
  return errors
}
