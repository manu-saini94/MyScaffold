import type { Experience, WorldDetail } from '../types/api'
import { api } from './api'
import { setServerClock } from './serverClock'

// Contract 1.4: both responses are no-store (they hold serverTime and time-based locks), so keep them briefly.
export const experienceApi = api.injectEndpoints({
  endpoints: (build) => ({
    getExperience: build.query<Experience, void>({
      query: () => '/experience',
      // runs at receipt, before the data reaches any component, so the clock is right on first render
      transformResponse: (res: Experience) => {
        setServerClock(res.serverTime)
        return res
      },
      providesTags: ['Experience'],
      keepUnusedDataFor: 30,
    }),
    getWorld: build.query<WorldDetail, string>({
      query: (slug) => `/worlds/${encodeURIComponent(slug)}`,
      transformResponse: (res: WorldDetail) => {
        setServerClock(res.serverTime)
        return res
      },
      providesTags: (_r, _e, slug) => [{ type: 'World', id: slug }],
      keepUnusedDataFor: 5,
    }),
  }),
})

export const { useGetExperienceQuery, useGetWorldQuery } = experienceApi
