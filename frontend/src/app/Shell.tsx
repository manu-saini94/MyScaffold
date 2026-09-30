import type { ReactNode } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'
import { AnimatePresence } from 'motion/react'
import { Particles } from '../components/Particles/Particles'
import { RoseDecor } from '../components/Rose/RoseDecor'
import { Launcher } from '../features/launcher/Launcher'
import { useParticleKind } from '../features/theme/useParticleKind'
import { Header } from './Header'

// AnimatePresence keeps this element (and the route context baked into `children`) alive while it exits.
function Frozen({ children }: { children: ReactNode }) {
  return <>{children}</>
}

/** App chrome. The launcher stays mounted under the world overlay so the shared-element transition can run both ways. */
export function Shell() {
  const kind = useParticleKind()
  const location = useLocation()
  const outlet = useOutlet()

  return (
    <>
      <RoseDecor />
      <Particles kind={kind} />
      <Header />
      <Launcher active={!outlet} />
      <AnimatePresence>{outlet && <Frozen key={location.pathname}>{outlet}</Frozen>}</AnimatePresence>
    </>
  )
}
