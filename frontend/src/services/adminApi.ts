import type {
  AdminLetter,
  AdminMe,
  AdminMoment,
  AdminSettings,
  AdminWorld,
  ImportJob,
  LetterRequest,
  MediaPage,
  MomentInput,
  PickerSession,
  PickerSessionStatus,
  SettingsUpdate,
  WorldRequest,
} from '../features/admin/types'
import { api } from './api'

const tagged = api.enhanceEndpoints({
  addTagTypes: ['AdminMe', 'AdminMedia', 'AdminWorlds', 'AdminMoments', 'AdminLetters', 'AdminSettings', 'ImportJob'],
})

/** What the viewer sees changes when the admin edits content. */
const VIEWER_TAGS = ['Experience', 'World'] as const

export const adminApi = tagged.injectEndpoints({
  endpoints: (build) => ({
    getAdminMe: build.query<AdminMe, void>({
      query: () => '/admin/me',
      providesTags: ['AdminMe'],
    }),

    // Picker and imports
    createPickerSession: build.mutation<PickerSession, { maxItemCount?: number } | void>({
      query: (body) => ({ url: '/admin/picker/sessions', method: 'POST', body: body ?? {} }),
    }),
    getPickerSession: build.query<PickerSessionStatus, string>({
      query: (id) => `/admin/picker/sessions/${encodeURIComponent(id)}`,
    }),
    startImport: build.mutation<{ jobId: string }, string>({
      query: (sessionId) => ({ url: `/admin/picker/sessions/${encodeURIComponent(sessionId)}/import`, method: 'POST' }),
    }),
    getImportJob: build.query<ImportJob, string>({
      query: (jobId) => `/admin/imports/${encodeURIComponent(jobId)}`,
      providesTags: (_r, _e, id) => [{ type: 'ImportJob', id }],
    }),

    // Media
    listMedia: build.query<MediaPage, { page: number; size: number }>({
      query: ({ page, size }) => `/admin/media?page=${page}&size=${size}`,
      providesTags: ['AdminMedia'],
    }),
    deleteMedia: build.mutation<void, string>({
      query: (id) => ({ url: `/admin/media/${encodeURIComponent(id)}`, method: 'DELETE' }),
      // its moments go with it, a cover is cleared, heroMediaIds loses the id
      invalidatesTags: ['AdminMedia', 'AdminWorlds', 'AdminMoments', 'AdminSettings', ...VIEWER_TAGS],
    }),

    // Worlds
    listWorlds: build.query<AdminWorld[], void>({
      query: () => '/admin/worlds',
      providesTags: ['AdminWorlds'],
    }),
    createWorld: build.mutation<AdminWorld, WorldRequest>({
      query: (body) => ({ url: '/admin/worlds', method: 'POST', body }),
      invalidatesTags: ['AdminWorlds', ...VIEWER_TAGS],
    }),
    updateWorld: build.mutation<AdminWorld, { id: string; body: WorldRequest }>({
      query: ({ id, body }) => ({ url: `/admin/worlds/${encodeURIComponent(id)}`, method: 'PUT', body }),
      invalidatesTags: ['AdminWorlds', ...VIEWER_TAGS],
    }),
    deleteWorld: build.mutation<void, string>({
      query: (id) => ({ url: `/admin/worlds/${encodeURIComponent(id)}?confirm=true`, method: 'DELETE' }),
      // letters are kept with worldId null
      invalidatesTags: ['AdminWorlds', 'AdminMoments', 'AdminLetters', ...VIEWER_TAGS],
    }),
    reorderWorlds: build.mutation<AdminWorld[], string[]>({
      query: (orderedIds) => ({ url: '/admin/worlds/reorder', method: 'PUT', body: { orderedIds } }),
      invalidatesTags: ['AdminWorlds', ...VIEWER_TAGS],
    }),

    // Moments
    getMoments: build.query<AdminMoment[], string>({
      query: (worldId) => `/admin/worlds/${encodeURIComponent(worldId)}/moments`,
      providesTags: (_r, _e, worldId) => [{ type: 'AdminMoments', id: worldId }],
    }),
    replaceMoments: build.mutation<unknown, { worldId: string; moments: MomentInput[] }>({
      query: ({ worldId, moments }) => ({
        url: `/admin/worlds/${encodeURIComponent(worldId)}/moments`,
        method: 'PUT',
        body: { moments },
      }),
      invalidatesTags: (_r, _e, { worldId }) => [{ type: 'AdminMoments', id: worldId }, 'AdminWorlds', ...VIEWER_TAGS],
    }),

    // Letters
    listLetters: build.query<AdminLetter[], void>({
      query: () => '/admin/letters',
      providesTags: ['AdminLetters'],
    }),
    createLetter: build.mutation<AdminLetter, LetterRequest>({
      query: (body) => ({ url: '/admin/letters', method: 'POST', body }),
      invalidatesTags: ['AdminLetters', ...VIEWER_TAGS],
    }),
    updateLetter: build.mutation<AdminLetter, { id: string; body: LetterRequest }>({
      query: ({ id, body }) => ({ url: `/admin/letters/${encodeURIComponent(id)}`, method: 'PUT', body }),
      invalidatesTags: ['AdminLetters', ...VIEWER_TAGS],
    }),
    deleteLetter: build.mutation<void, string>({
      query: (id) => ({ url: `/admin/letters/${encodeURIComponent(id)}`, method: 'DELETE' }),
      invalidatesTags: ['AdminLetters', ...VIEWER_TAGS],
    }),

    // Settings
    getSettings: build.query<AdminSettings, void>({
      query: () => '/admin/settings',
      providesTags: ['AdminSettings'],
    }),
    updateSettings: build.mutation<AdminSettings, SettingsUpdate>({
      query: (body) => ({ url: '/admin/settings', method: 'PUT', body }),
      invalidatesTags: ['AdminSettings', ...VIEWER_TAGS],
    }),
    signOutEveryone: build.mutation<void, void>({
      query: () => ({ url: '/admin/settings/sign-out-everyone', method: 'POST' }),
    }),
    resetRateLimits: build.mutation<void, void>({
      query: () => ({ url: '/admin/auth/reset-rate-limits', method: 'POST' }),
    }),
  }),
})

export const {
  useGetAdminMeQuery,
  useCreatePickerSessionMutation,
  useGetPickerSessionQuery,
  useStartImportMutation,
  useGetImportJobQuery,
  useListMediaQuery,
  useDeleteMediaMutation,
  useListWorldsQuery,
  useCreateWorldMutation,
  useUpdateWorldMutation,
  useDeleteWorldMutation,
  useReorderWorldsMutation,
  useGetMomentsQuery,
  useReplaceMomentsMutation,
  useListLettersQuery,
  useCreateLetterMutation,
  useUpdateLetterMutation,
  useDeleteLetterMutation,
  useGetSettingsQuery,
  useUpdateSettingsMutation,
  useSignOutEveryoneMutation,
  useResetRateLimitsMutation,
} = adminApi
