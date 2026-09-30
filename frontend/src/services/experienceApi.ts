import { api } from './api'
import type { World } from '../types/world'

// STUB: not wired to the backend yet. The UI reads features/launcher/worldsMock.ts.
export const experienceApi = api.injectEndpoints({
  endpoints: (build) => ({
    getWorlds: build.query<World[], void>({
      query: () => '/worlds',
      providesTags: ['Worlds'],
    }),
    getWorld: build.query<World, string>({
      query: (slug) => `/worlds/${encodeURIComponent(slug)}`,
      providesTags: (_r, _e, slug) => [{ type: 'World', id: slug }],
    }),
  }),
})

export const { useGetWorldsQuery, useGetWorldQuery } = experienceApi
