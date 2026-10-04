// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { BUNDLED_SONGS } from '../../services/music'
import { WorldEditor } from './WorldEditor'
import { json, renderAdmin, route, stubFetch, ULID_A } from './testSupport'
import type { AdminWorld } from './types'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const WORLD: AdminWorld = {
  id: ULID_A,
  slug: 'first-trip',
  title: 'First trip',
  subtitle: null,
  tagline: null,
  layout: 'FILM_STRIP',
  coverMediaId: null,
  themeAccent: null,
  sortOrder: 0,
  unlockAt: '2027-02-13T18:30:00Z',
  introText: null,
  outroText: null,
  musicUrl: null,
  published: true,
  momentCount: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

describe('WorldEditor form validation', () => {
  it('shows field errors and sends nothing when required fields are missing', () => {
    const calls = stubFetch()
    renderAdmin(<WorldEditor />)
    fireEvent.click(screen.getByRole('button', { name: 'Create world' }))
    const title = screen.getByLabelText('Title')
    expect(title.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('Title is required.')).toBeTruthy()
    expect(screen.getByText('Slug is required.')).toBeTruthy()
    expect(calls).toHaveLength(0)
  })

  it('offers exactly the bundled songs (if any) for the music field and still allows free text', () => {
    stubFetch()
    renderAdmin(<WorldEditor />)
    const music = screen.getByLabelText('Music') as HTMLInputElement
    expect(music.type).toBe('text')
    const list = document.getElementById(music.getAttribute('list') ?? '')
    const options = [...(list?.querySelectorAll('option') ?? [])]
    expect(options.map((o) => o.value)).toEqual(BUNDLED_SONGS.map((song) => song.path))
    fireEvent.change(music, { target: { value: 'https://music.test/a.mp3' } })
    expect(music.value).toBe('https://music.test/a.mp3')
  })

  it('derives the slug from the title until the slug is edited by hand', () => {
    stubFetch()
    renderAdmin(<WorldEditor />)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Our First Trip' } })
    expect((screen.getByLabelText('Slug') as HTMLInputElement).value).toBe('our-first-trip')
    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'custom' } })
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Another' } })
    expect((screen.getByLabelText('Slug') as HTMLInputElement).value).toBe('custom')
  })

  it('shows server field errors next to their fields', async () => {
    stubFetch(
      route('POST', '/api/admin/worlds', () =>
        json(
          {
            type: 'urn:ourstory:problem:validation-failed',
            title: 'Bad',
            status: 400,
            errors: [{ field: 'themeAccent', message: 'must be a #rrggbb colour' }],
          },
          400,
        ),
      ),
    )
    renderAdmin(<WorldEditor />)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Trip' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create world' }))
    await screen.findByText('must be a #rrggbb colour')
    expect(screen.getByLabelText('Accent colour').getAttribute('aria-invalid')).toBe('true')
  })

  it('updates the layout preview label live', () => {
    stubFetch()
    renderAdmin(<WorldEditor />)
    expect(screen.getByTestId('layout-preview').textContent).toContain('Polaroid table')
    fireEvent.change(screen.getByLabelText('Layout'), { target: { value: 'CONSTELLATION' } })
    expect(screen.getByTestId('layout-preview').textContent).toContain('Constellation')
  })

  it('PUT sends every field, with unlockAt null after clearing it', async () => {
    const calls = stubFetch(
      route('GET', `/api/admin/worlds/${ULID_A}/moments`, () => json([])),
      route('PUT', `/api/admin/worlds/${ULID_A}`, () => json(WORLD)),
    )
    renderAdmin(<WorldEditor world={WORLD} />)
    fireEvent.change(screen.getByLabelText('Unlocks at'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save world' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true))
    expect(calls.find((c) => c.method === 'PUT')!.body).toMatchObject({
      slug: 'first-trip',
      layout: 'FILM_STRIP',
      unlockAt: null,
      published: true,
      musicUrl: null,
    })
  })
})
