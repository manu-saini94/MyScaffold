import type { Moment, OpenWorldDetail, WorldDetail, WorldSummary } from '../../types/api'

/** One world in the story, from the experience summary. Locked worlds play as a short "still waiting" card. */
export type Chapter =
  | { kind: 'open'; slug: string; title: string; subtitle: string | null; tagline: string | null; accent: string | null }
  | { kind: 'locked'; slug: string; title: string; subtitle: string | null; unlockAt: string }

/** Every world in sortOrder (stable for ties). The input is not touched. */
export function buildChapters(worlds: readonly WorldSummary[]): Chapter[] {
  return [...worlds]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((w) =>
      w.locked
        ? { kind: 'locked', slug: w.slug, title: w.title, subtitle: w.subtitle, unlockAt: w.unlockAt }
        : { kind: 'open', slug: w.slug, title: w.title, subtitle: w.subtitle, tagline: w.tagline, accent: w.themeAccent },
    )
}

/** What a chapter actually plays, once (and if) its detail is known. */
export type ChapterContent =
  | { kind: 'pending' }
  | { kind: 'open'; world: OpenWorldDetail }
  | { kind: 'locked'; unlockAt: string }
  | { kind: 'missing' }

/** A summary can be stale: the detail decides (a world may have locked, or vanished, since the home loaded). */
export function resolveChapter(chapter: Chapter, detail: WorldDetail | undefined, failed: boolean): ChapterContent {
  if (chapter.kind === 'locked') return { kind: 'locked', unlockAt: chapter.unlockAt }
  if (failed) return { kind: 'missing' }
  if (!detail) return { kind: 'pending' }
  if (detail.locked) return { kind: 'locked', unlockAt: detail.unlockAt }
  return { kind: 'open', world: detail }
}

/** Slides in a chapter: title card + one per moment; 1 for a locked card; 0 skips it; null while still loading. */
export function slideCount(content: ChapterContent): number | null {
  switch (content.kind) {
    case 'pending':
      return null
    case 'missing':
      return 0
    case 'locked':
      return 1
    case 'open':
      return 1 + content.world.moments.length
  }
}

/** What is on screen at one position. */
export type SlideView =
  | { kind: 'title'; number: number; title: string; subtitle: string | null; tagline: string | null; accent: string | null }
  | { kind: 'moment'; world: OpenWorldDetail; moment: Moment; index: number }
  | { kind: 'locked'; number: number; title: string; subtitle: string | null; unlockAt: string }
  | { kind: 'final' }

/** The slide at (`chapterIndex`, `slide`); `content` is that chapter's resolved content. Past the last chapter: the final card. */
export function slideAt(chapters: readonly Chapter[], chapterIndex: number, slide: number, content: ChapterContent): SlideView {
  const chapter = chapters[chapterIndex]
  if (!chapter) return { kind: 'final' }
  const number = chapterIndex + 1
  if (chapter.kind === 'locked') return { kind: 'locked', number, title: chapter.title, subtitle: chapter.subtitle, unlockAt: chapter.unlockAt }
  if (content.kind === 'locked') return { kind: 'locked', number, title: chapter.title, subtitle: chapter.subtitle, unlockAt: content.unlockAt }
  if (content.kind === 'open') {
    const { world } = content
    const moment = slide > 0 ? world.moments[slide - 1] : undefined
    if (moment) return { kind: 'moment', world, moment, index: slide - 1 }
    return { kind: 'title', number, title: world.title, subtitle: world.subtitle, tagline: world.tagline, accent: world.themeAccent }
  }
  return { kind: 'title', number, title: chapter.title, subtitle: chapter.subtitle, tagline: chapter.tagline, accent: chapter.accent }
}

/** Slug of the first open chapter after `from`, to fetch ahead; null when there is none. */
export function nextOpenSlug(chapters: readonly Chapter[], from: number): string | null {
  for (let i = from + 1; i < chapters.length; i++) {
    const c = chapters[i]
    if (c?.kind === 'open') return c.slug
  }
  return null
}
