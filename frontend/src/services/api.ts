import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

// Base API. Endpoints are added with injectEndpoints (see experienceApi.ts).
export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: '/api', credentials: 'include' }),
  tagTypes: ['Worlds', 'World'],
  endpoints: () => ({}),
})
