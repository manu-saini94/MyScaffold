import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { ApiLayout } from '../types/api'
import type { WorldLayoutProps } from './types'

type LayoutModule = { default: ComponentType<WorldLayoutProps> }

/** One chunk per layout. Also used to warm the next world's chunk from the outro. */
export const LAYOUT_LOADERS: Readonly<Record<ApiLayout, () => Promise<LayoutModule>>> = {
  POLAROID_TABLE: () => import('./PolaroidTable/index'),
  FILM_STRIP: () => import('./FilmStrip/index'),
  POSTCARDS: () => import('./Postcards/index'),
  MEMORY_WALL: () => import('./MemoryWall/index'),
  ENVELOPE: () => import('./Envelope/index'),
  CONSTELLATION: () => import('./Constellation/index'),
}

export const LAYOUTS: Readonly<Record<ApiLayout, LazyExoticComponent<ComponentType<WorldLayoutProps>>>> = {
  POLAROID_TABLE: lazy(LAYOUT_LOADERS.POLAROID_TABLE),
  FILM_STRIP: lazy(LAYOUT_LOADERS.FILM_STRIP),
  POSTCARDS: lazy(LAYOUT_LOADERS.POSTCARDS),
  MEMORY_WALL: lazy(LAYOUT_LOADERS.MEMORY_WALL),
  ENVELOPE: lazy(LAYOUT_LOADERS.ENVELOPE),
  CONSTELLATION: lazy(LAYOUT_LOADERS.CONSTELLATION),
}

/** Warm a layout chunk; failures are ignored here (the lazy component retries and surfaces them). */
export function preloadLayout(layout: ApiLayout): void {
  const load = LAYOUT_LOADERS[layout]
  if (load) void load().catch(() => undefined)
}
