/**
 * Story playback as plain data. Every function is pure and takes the time (`now`, ms on any monotonic clock) from the
 * caller, so the player injects its clock and tests drive it by hand.
 *
 * Position: `chapter` indexes the chapter list (=== length means the final card); `slide` 0 is the chapter's first
 * slide (title card, or the locked card). Outline: slides per chapter, 0 = skip it, null = not loaded yet.
 */

export interface Position {
  chapter: number
  slide: number
}

export interface StoryState {
  pos: Position
  playing: boolean
  /** When the current run of play started. */
  startedAt: number
  /** Time already spent on this slide before the current run (pauses bank it here). */
  banked: number
}

export type Outline = readonly (number | null)[]

export function startState(now: number): StoryState {
  return { pos: { chapter: 0, slide: 0 }, playing: true, startedAt: now, banked: 0 }
}

export function elapsedMs(s: StoryState, now: number): number {
  return s.banked + (s.playing ? Math.max(0, now - s.startedAt) : 0)
}

export function setPlaying(s: StoryState, playing: boolean, now: number): StoryState {
  if (s.playing === playing) return s
  return playing ? { ...s, playing, startedAt: now } : { ...s, playing, banked: elapsedMs(s, now) }
}

/** Jump to `pos` with a fresh slide clock; play/pause is kept. Same position returns the same object. */
export function moveTo(s: StoryState, pos: Position, now: number): StoryState {
  if (pos.chapter === s.pos.chapter && pos.slide === s.pos.slide) return s
  return { ...s, pos, startedAt: now, banked: 0 }
}

export function isEnd(pos: Position, outline: Outline): boolean {
  return pos.chapter >= outline.length
}

/** First chapter at or after `chapter` that has something to show (the final card when none). */
export function firstShown(outline: Outline, chapter: number): number {
  let c = Math.max(0, chapter)
  while (c < outline.length && outline[c] === 0) c++
  return c
}

/** Last chapter at or before `chapter` that has something to show; -1 when none. */
function lastShown(outline: Outline, chapter: number): number {
  let c = Math.min(chapter, outline.length - 1)
  while (c >= 0 && outline[c] === 0) c--
  return c
}

/** The slide after `pos`. Null while the current chapter is still loading (stay on its title card). */
export function nextPos(pos: Position, outline: Outline): Position | null {
  if (isEnd(pos, outline)) return pos
  const count = outline[pos.chapter]
  if (count == null) return null
  if (pos.slide + 1 < count) return { chapter: pos.chapter, slide: pos.slide + 1 }
  return { chapter: firstShown(outline, pos.chapter + 1), slide: 0 }
}

/** The slide before `pos`; the very first slide stays put. A chapter not loaded yet is entered at its title card. */
export function prevPos(pos: Position, outline: Outline): Position {
  if (pos.slide > 0 && !isEnd(pos, outline)) return { chapter: pos.chapter, slide: pos.slide - 1 }
  const c = lastShown(outline, pos.chapter - 1)
  if (c < 0) return pos
  const count = outline[c]
  return { chapter: c, slide: count == null ? 0 : count - 1 }
}

/** The next chapter's first slide (or the final card). */
export function nextChapterPos(pos: Position, outline: Outline): Position {
  if (isEnd(pos, outline)) return pos
  return { chapter: firstShown(outline, pos.chapter + 1), slide: 0 }
}

/** Moves on when the current slide has run its `duration`. Returns `s` itself when nothing changes. */
export function advanceIfDue(s: StoryState, now: number, duration: number, outline: Outline): StoryState {
  if (!s.playing || isEnd(s.pos, outline) || elapsedMs(s, now) < duration) return s
  const next = nextPos(s.pos, outline)
  return next ? moveTo(s, next, now) : s
}
