import { createBrowserRouter, Navigate } from 'react-router-dom'
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
  { path: '*', element: <Navigate to="/" replace /> },
])
