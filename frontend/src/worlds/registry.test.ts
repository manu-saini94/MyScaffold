// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { ApiLayout } from '../types/api'
import { LAYOUT_LOADERS, LAYOUTS } from './registry'

const ALL: ApiLayout[] = ['POLAROID_TABLE', 'FILM_STRIP', 'POSTCARDS', 'MEMORY_WALL', 'ENVELOPE', 'CONSTELLATION']

describe('layout registry', () => {
  it('has a lazy component for exactly the six API layouts', () => {
    expect(Object.keys(LAYOUTS).sort()).toEqual([...ALL].sort())
    expect(Object.keys(LAYOUT_LOADERS).sort()).toEqual([...ALL].sort())
  })

  it('each loader resolves to a module with a default component', async () => {
    for (const key of ALL) {
      const mod = await LAYOUT_LOADERS[key]()
      expect(typeof mod.default).toBe('function')
    }
  })
})
