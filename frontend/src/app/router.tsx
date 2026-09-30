import { createBrowserRouter, Navigate } from 'react-router-dom'
import { preloadWorld } from '../features/world/preload'
import { Shell } from './Shell'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Shell />,
    HydrateFallback: () => null,
    children: [
      {
        path: 'world/:slug',
        // world view is a separate chunk; the launcher (home) ships in the initial bundle
        lazy: async () => ({ Component: (await preloadWorld()).default }),
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
