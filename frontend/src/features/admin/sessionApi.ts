import { api } from '../../services/api'
import { adminApi } from '../../services/adminApi'

// Absolute: the shared base query is rooted at /api, but Spring Security's logout lives at /logout.
const LOGOUT_URL = `${typeof location === 'undefined' ? '' : location.origin}/logout`

/** Ends the Google session. Logout answers 204 or a redirect; both count as success. AdminMe is refetched so the app shows the sign-in state. */
export const adminSessionApi = api.enhanceEndpoints({ addTagTypes: ['AdminMe'] }).injectEndpoints({
  endpoints: (build) => ({
    adminSignOut: build.mutation<void, void>({
      query: () => ({
        url: LOGOUT_URL,
        method: 'POST',
        responseHandler: (response) => response.text(),
        validateStatus: (response) => response.status < 400,
      }),
      transformResponse: () => undefined,
      invalidatesTags: ['AdminMe'],
    }),
  }),
})

export const { useAdminSignOutMutation } = adminSessionApi

/** Marks the admin identity stale, e.g. after a 401 from an admin call. */
export const invalidateAdminMe = () => adminApi.util.invalidateTags(['AdminMe'])
