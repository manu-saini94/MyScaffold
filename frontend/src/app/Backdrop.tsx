import type { ReactNode } from 'react'
import { Particles } from '../components/Particles/Particles'
import { RoseDecor } from '../components/Rose/RoseDecor'
import { useParticleKind } from '../features/theme/useParticleKind'

/** Theme atmosphere (roses + particles) for the screens that live outside Shell: unlock and profile gate. */
export function Backdrop({ children }: { children: ReactNode }) {
  const kind = useParticleKind()
  return (
    <>
      <RoseDecor />
      <Particles kind={kind} />
      {children}
    </>
  )
}
