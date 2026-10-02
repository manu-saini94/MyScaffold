import type { ApiLayout, WorldSummary } from '../../types/api'
import type { World, WorldLayout } from '../../types/world'

const LAYOUTS: Record<ApiLayout, WorldLayout> = {
  POLAROID_TABLE: 'polaroid',
  FILM_STRIP: 'filmstrip',
  POSTCARDS: 'postcards',
  MEMORY_WALL: 'memorywall',
  ENVELOPE: 'envelope',
  CONSTELLATION: 'constellation',
}

/** Used when the server gives no cover colour or accent. Picked by slug so a world never changes colour on reload. */
const FALLBACK_TINTS: readonly (readonly [string, string])[] = [
  ['#f3c9cf', '#b3122f'],
  ['#f6d7b8', '#c4402f'],
  ['#c9d9e8', '#7a1f3d'],
  ['#efd5e2', '#a3204a'],
  ['#f7e3c4', '#8f1226'],
  ['#2a1b4d', '#e50914'],
]

const HEX_COLOUR = /^#[0-9a-f]{3,8}$/i

function hash(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0
  return h
}

function pickLayout(layout: string): WorldLayout {
  return Object.hasOwn(LAYOUTS, layout) ? LAYOUTS[layout as ApiLayout] : 'polaroid'
}

function colourOr(value: string | null | undefined, fallback: string): string {
  return value && HEX_COLOUR.test(value) ? value : fallback
}

/** Pure: GET /api/experience worlds -> launcher worlds, ordered by the server's sortOrder. */
export function mapExperienceWorlds(summaries: readonly WorldSummary[]): World[] {
  return [...summaries]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((w, i) => {
      const fallback = FALLBACK_TINTS[hash(w.slug) % FALLBACK_TINTS.length]!
      const cover = w.locked ? null : w.cover
      return {
        id: w.slug,
        chapter: i + 1,
        slug: w.slug,
        title: w.title,
        subtitle: w.subtitle ?? '',
        layout: pickLayout(w.layout),
        tint: [colourOr(cover?.dominantColor, fallback[0]), colourOr(w.themeAccent, fallback[1])] as const,
        photoCount: w.locked ? 0 : w.momentCount,
        locked: w.locked,
        unlockAt: w.locked ? w.unlockAt : null,
        cover,
        previewMediaIds: w.locked ? [] : w.previewMediaIds,
      }
    })
}
