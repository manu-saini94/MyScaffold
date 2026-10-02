import type { MediaRef } from './api'

export type WorldLayout = 'polaroid' | 'filmstrip' | 'postcards' | 'memorywall' | 'envelope' | 'constellation'

/** A launcher world, mapped from the GET /api/experience summary (features/launcher/mapExperience.ts). */
export interface World {
  /** Stable key: the slug. */
  id: string
  /** 1-based position in the launcher. */
  chapter: number
  slug: string
  title: string
  subtitle: string
  layout: WorldLayout
  /** Two CSS colours used for placeholder photo tiles until real media exists. */
  tint: readonly [string, string]
  photoCount: number
  locked: boolean
  /** ISO-8601 UTC instant from the server; compare against serverNow(). */
  unlockAt: string | null
  /** Null when the world has none, and always null while locked. */
  cover: MediaRef | null
  previewMediaIds: readonly string[]
}

export type ThemeName = 'rose' | 'cinema'
export type ParticleKind = 'petals' | 'embers'
