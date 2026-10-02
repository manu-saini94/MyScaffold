import { OutroLetters } from '../letters'
import type { OpenWorldDetail } from '../../types/api'

/**
 * LETTERS SLOT: rendered by the outro, after the outro text and before "Next chapter".
 * WORLD_OUTRO letters render here as sealed envelopes; SEALED_ICON letters float at the corner (see OpenWorld).
 */
export function LettersSlot({ world }: { world: OpenWorldDetail }) {
  return <OutroLetters world={world} />
}
