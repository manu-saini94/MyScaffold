import { useClickEffects } from './useClickEffects'

/** Mount once per screen tree to turn on tap bursts (see useClickEffects). Renders nothing itself. */
export function ClickEffects() {
  useClickEffects()
  return null
}
