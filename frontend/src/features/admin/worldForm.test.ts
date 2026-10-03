import { describe, expect, it } from 'vitest'
import type { AdminWorld } from './types'
import { EMPTY_DRAFT, draftFromWorld, fromLocalInput, slugify, toLocalInput, toWorldRequest, validateDraft } from './worldForm'

describe('slugify', () => {
  it('makes kebab-case slugs', () => {
    expect(slugify('Our First Trip!')).toBe('our-first-trip')
    expect(slugify('  --Café  ')).toBe('cafe')
  })
})

describe('validateDraft', () => {
  it('requires a title and a kebab-case slug', () => {
    expect(validateDraft(EMPTY_DRAFT)).toMatchObject({ title: expect.any(String), slug: expect.any(String) })
    expect(validateDraft({ ...EMPTY_DRAFT, title: 'T', slug: 'Bad Slug' }).slug).toBeDefined()
    expect(validateDraft({ ...EMPTY_DRAFT, title: 'T', slug: 'good-slug' })).toEqual({})
  })

  it('checks accent colour and music link', () => {
    const base = { ...EMPTY_DRAFT, title: 'T', slug: 's' }
    expect(validateDraft({ ...base, themeAccent: 'red' }).themeAccent).toBeDefined()
    expect(validateDraft({ ...base, themeAccent: '#b3122f' })).toEqual({})
    expect(validateDraft({ ...base, musicUrl: 'http://x.example' }).musicUrl).toBeDefined()
  })
})

describe('toWorldRequest', () => {
  it('sends an empty unlock time as null so a PUT clears the lock, and always sends published', () => {
    const body = toWorldRequest({ ...EMPTY_DRAFT, title: ' T ', slug: 's', published: false })
    expect(body.unlockAt).toBeNull()
    expect(body.published).toBe(false)
    expect(body.title).toBe('T')
    expect(body.subtitle).toBeNull()
  })

  it('round-trips the unlock time through the local input', () => {
    const iso = '2027-02-13T18:30:00.000Z'
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso)
  })
})

describe('unlockAt with seconds', () => {
  const world = { slug: 's', title: 'T', layout: 'FILM_STRIP', published: true, unlockAt: '2027-02-13T18:30:45Z' } as AdminWorld

  it('keeps the original instant while the input is untouched', () => {
    expect(toWorldRequest(draftFromWorld(world)).unlockAt).toBe('2027-02-13T18:30:45Z')
  })

  it('uses the edited value once the input changes, and null once cleared', () => {
    const draft = draftFromWorld(world)
    expect(toWorldRequest({ ...draft, unlockAt: '2027-03-01T09:15' }).unlockAt).toBe(fromLocalInput('2027-03-01T09:15'))
    expect(toWorldRequest({ ...draft, unlockAt: '' }).unlockAt).toBeNull()
  })
})
