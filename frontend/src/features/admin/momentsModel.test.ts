import { describe, expect, it } from 'vitest'
import { fromMedia, move, toMomentInputs, type EditableMoment } from './momentsModel'

const item = (mediaId: string, extra: Partial<EditableMoment> = {}): EditableMoment => ({
  key: mediaId,
  mediaId,
  caption: '',
  note: '',
  happenedOn: '',
  place: '',
  favourite: false,
  ...extra,
})

describe('move', () => {
  it('moves an item without touching the input', () => {
    const input = ['a', 'b', 'c']
    expect(move(input, 0, 2)).toEqual(['b', 'c', 'a'])
    expect(input).toEqual(['a', 'b', 'c'])
  })

  it('ignores out-of-range moves', () => {
    expect(move(['a', 'b'], 0, 5)).toEqual(['a', 'b'])
    expect(move(['a', 'b'], -1, 0)).toEqual(['a', 'b'])
  })
})

describe('toMomentInputs', () => {
  it('keeps array order and sends blank texts as null', () => {
    const body = toMomentInputs([item('B', { caption: 'Hi', favourite: true }), item('A', { note: '  ' })])
    expect(body.map((m) => m.mediaId)).toEqual(['B', 'A'])
    expect(body[0]).toEqual({ mediaId: 'B', caption: 'Hi', note: null, happenedOn: null, place: null, favourite: true })
    expect(body[1]!.note).toBeNull()
  })
})

describe('fromMedia', () => {
  it('starts from the photo date and never reuses a server id as key', () => {
    const m = fromMedia({
      id: 'M1',
      filename: null,
      mimeType: 'image/jpeg',
      width: 1,
      height: 1,
      takenAt: '2026-02-14T10:00:00Z',
      lqip: null,
      dominantColor: null,
      importedAt: '2026-02-15T10:00:00Z',
    })
    expect(m.happenedOn).toBe('2026-02-14')
    expect(m.key).toBe('new-M1')
  })
})
