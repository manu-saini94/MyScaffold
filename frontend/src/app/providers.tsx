import type { ReactNode } from 'react'
import { Provider } from 'react-redux'
import { LazyMotion, MotionConfig } from 'motion/react'
import { store } from './store'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <Provider store={store}>
      <MotionConfig reducedMotion="user">
        <LazyMotion features={() => import('./motionFeatures').then((m) => m.default)} strict>
          {children}
        </LazyMotion>
      </MotionConfig>
    </Provider>
  )
}
