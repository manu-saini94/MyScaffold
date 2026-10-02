import type { AuthQuestion, AuthStatus } from '../types/api'
import { sessionLost, unlocked } from '../features/session/sessionSlice'
import { api } from './api'

// Errors surface as FetchBaseQueryError; `error.data` is a Problem (types/api.ts).
export const authApi = api.injectEndpoints({
  endpoints: (build) => ({
    getAuthStatus: build.query<AuthStatus, void>({
      query: () => '/auth/status',
      providesTags: ['Session'],
    }),
    getQuestion: build.query<AuthQuestion, void>({
      query: () => '/auth/question',
    }),
    unlock: build.mutation<void, { answer: string }>({
      query: (body) => ({ url: '/auth/unlock', method: 'POST', body }),
      invalidatesTags: (_r, error) => (error ? [] : ['Experience', 'Session']),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled
          dispatch(unlocked())
        } catch {
          /* the caller reads the Problem from the mutation result */
        }
      },
    }),
    lock: build.mutation<void, void>({
      query: () => ({ url: '/auth/lock', method: 'POST' }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled
          dispatch(sessionLost())
          dispatch(api.util.resetApiState())
        } catch {
          /* still unlocked server-side; nothing to reset */
        }
      },
    }),
  }),
})

export const { useGetAuthStatusQuery, useGetQuestionQuery, useUnlockMutation, useLockMutation } = authApi
