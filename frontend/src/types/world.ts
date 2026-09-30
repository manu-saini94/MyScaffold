export type WorldLayout = 'polaroid' | 'filmstrip' | 'postcards' | 'memorywall' | 'envelope' | 'constellation'

/** Shaped like the future GET /api/worlds payload. */
export interface World {
  id: number
  slug: string
  title: string
  subtitle: string
  layout: WorldLayout
  /** Two CSS colours used for placeholder photo tiles until real media exists. */
  tint: readonly [string, string]
  photoCount: number
  locked: boolean
  /** ISO local date-time. Server is the source of truth once wired. */
  unlockAt: string | null
}

export type ThemeName = 'rose' | 'cinema'
export type ParticleKind = 'petals' | 'embers'
