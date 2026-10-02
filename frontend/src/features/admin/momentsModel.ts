import type { AdminMedia, AdminMoment, MomentInput } from './types'

/** A moment as edited on screen. `key` is stable across reorders (dnd-kit needs it); texts are never null. */
export interface EditableMoment {
  key: string
  mediaId: string
  caption: string
  note: string
  happenedOn: string
  place: string
  favourite: boolean
}

export function fromServer(moment: AdminMoment): EditableMoment {
  return {
    key: moment.id,
    mediaId: moment.mediaId,
    caption: moment.caption ?? '',
    note: moment.note ?? '',
    happenedOn: moment.happenedOn ?? '',
    place: moment.place ?? '',
    favourite: moment.favourite,
  }
}

export function fromMedia(media: AdminMedia): EditableMoment {
  const date = media.takenAt ? media.takenAt.slice(0, 10) : ''
  return {
    key: `new-${media.id}`,
    mediaId: media.id,
    caption: '',
    note: '',
    happenedOn: date,
    place: '',
    favourite: false,
  }
}

const orNull = (value: string): string | null => (value.trim() === '' ? null : value)

/** Body items of PUT /admin/worlds/{id}/moments; array order is the display order. */
export function toMomentInputs(items: readonly EditableMoment[]): MomentInput[] {
  return items.map((m) => ({
    mediaId: m.mediaId,
    caption: orNull(m.caption),
    note: orNull(m.note),
    happenedOn: orNull(m.happenedOn),
    place: orNull(m.place),
    favourite: m.favourite,
  }))
}

/** New array with the item at `from` moved to `to`. Out-of-range moves return the input unchanged. */
export function move<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return [...items]
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item as T)
  return next
}
