import type { Moment } from '../../types/api'

/**
 * The envelope's sequence: sealed -> opening (seal breaks, flap opens) -> letter (card slides up) -> photos (one more
 * each step) -> done. Pure, so the component only maps it to animation and timers.
 */
export type Stage = 'sealed' | 'opening' | 'letter' | 'photos' | 'done'

export interface UnfoldState {
  stage: Stage
  /** How many photos have unfolded so far (the current one is `shown - 1`). */
  shown: number
  total: number
  /** Auto-advance on (letter and photos only; opening always runs). */
  playing: boolean
}

export type UnfoldAction = { type: 'open' } | { type: 'advance' } | { type: 'toggle' } | { type: 'pause' }

export interface UnfoldTiming {
  openMs: number
  letterMs: number
  photoMs: number
  /** Time on the last photo before the layout reports the end. */
  endMs: number
}

export const TIMING: UnfoldTiming = { openMs: 1900, letterMs: 2200, photoMs: 1600, endMs: 1800 }
export const REDUCED_TIMING: UnfoldTiming = { openMs: 350, letterMs: 2200, photoMs: 1600, endMs: 1200 }

export function initialUnfold(total: number): UnfoldState {
  return { stage: 'sealed', shown: 0, total: Math.max(0, total), playing: true }
}

export function unfoldReducer(state: UnfoldState, action: UnfoldAction): UnfoldState {
  switch (action.type) {
    case 'open':
      return state.stage === 'sealed' ? { ...state, stage: 'opening' } : state
    case 'toggle':
      return { ...state, playing: !state.playing }
    case 'pause':
      return state.playing ? { ...state, playing: false } : state
    case 'advance':
      return advance(state)
  }
}

function advance(state: UnfoldState): UnfoldState {
  switch (state.stage) {
    case 'opening':
      return { ...state, stage: 'letter' }
    case 'letter':
      return state.total > 0 ? { ...state, stage: 'photos', shown: 1 } : { ...state, stage: 'done' }
    case 'photos':
      return state.shown < state.total ? { ...state, shown: state.shown + 1 } : { ...state, stage: 'done' }
    default:
      return state // sealed needs 'open'; done is final
  }
}

/** Milliseconds until the next automatic 'advance', or null when the sequence waits for the viewer. */
export function autoDelay(state: UnfoldState, timing: UnfoldTiming): number | null {
  switch (state.stage) {
    case 'opening':
      return timing.openMs
    case 'letter':
      return state.playing ? timing.letterMs : null
    case 'photos':
      if (!state.playing) return null
      return state.shown < state.total ? timing.photoMs : timing.endMs
    default:
      return null
  }
}

/** The proposal photo: the first moment flagged favourite, else the last one; -1 when there are none. */
export function keyMomentIndex(moments: readonly Pick<Moment, 'favourite'>[]): number {
  const fav = moments.findIndex((mo) => mo.favourite)
  return fav >= 0 ? fav : moments.length - 1
}
