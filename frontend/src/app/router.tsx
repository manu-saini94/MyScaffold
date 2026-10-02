import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { ProfileGate } from '../features/profiles/ProfileGate'
import { SessionGate } from '../features/session/SessionGate'
import { UnlockScreen } from '../features/unlock/UnlockScreen'
import { preloadWorld } from '../features/world/preload'
import { Backdrop } from './Backdrop'
import { Shell } from './Shell'

export const router = createBrowserRouter([
  {
    path: '/unlock',
    element: (
      <Backdrop>
        <SessionGate route="unlock">
          <UnlockScreen />
        </SessionGate>
      </Backdrop>
    ),
    HydrateFallback: () => null,
  },
  {
    path: '/who',
    element: (
      <Backdrop>
        <SessionGate route="who">
          <ProfileGate />
        </SessionGate>
      </Backdrop>
    ),
    HydrateFallback: () => null,
  },
  {
    path: '/',
    element: (
      <SessionGate route="app">
        <Shell />
      </SessionGate>
    ),
    HydrateFallback: () => null,
    children: [
      {
        path: 'world/:slug',
        // world view is a separate chunk; the launcher (home) ships in the initial bundle
        lazy: async () => ({ Component: (await preloadWorld()).default }),
      },
    ],
  },
  {
    // "Play our story": same guard as the home, but a full-screen sibling of it rather than a child of Shell, so the
    // home's chrome (header, roses, particles, orbs, click bursts) is not mounted and animating underneath. Lazy chunk.
    path: '/story',
    element: (
      <SessionGate route="app">
        <Outlet />
      </SessionGate>
    ),
    HydrateFallback: () => null,
    children: [{ index: true, lazy: async () => ({ Component: (await import('../features/story/StoryRoute')).default }) }],
  },
  {
    // The admin is a Google session, not a viewer session: outside SessionGate, and its own lazy chunk.
    path: '/admin/*',
    lazy: async () => ({ Component: (await import('../features/admin/AdminApp')).default }),
    HydrateFallback: () => null,
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
