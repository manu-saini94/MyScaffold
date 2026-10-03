// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { MomentsEditor } from './MomentsEditor'
import { json, noContent, problem, renderAdmin, route, stubFetch, ULID_A, ULID_B, ULID_C } from './testSupport'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const moment = (id: string, mediaId: string, caption: string) => ({
  id,
  mediaId,
  caption,
  note: null,
  happenedOn: null,
  place: null,
  sortOrder: 0,
  favourite: false,
  mimeType: 'image/jpeg',
  width: 10,
  height: 10,
  lqip: null,
  dominantColor: null,
  takenAt: null,
})
const SERVER = [moment('m1', ULID_A, 'First'), moment('m2', ULID_B, 'Second'), moment('m3', ULID_C, 'Third')]
const WORLD = 'WORLD1'
const momentsPath = `/api/admin/worlds/${WORLD}/moments`

describe('MomentsEditor', () => {
  it('saves the reordered list in display order with edited fields', async () => {
    const calls = stubFetch(route('GET', momentsPath, () => json(SERVER)), route('PUT', momentsPath, () => noContent()))
    renderAdmin(<MomentsEditor worldId={WORLD} />)
    await screen.findByLabelText('Caption (photo 1)')

    fireEvent.click(screen.getByRole('button', { name: 'Move down (photo 1)' })) // First -> position 2
    fireEvent.click(screen.getByRole('button', { name: 'Move up (photo 3)' })) // Third -> position 2
    const captions = screen.getAllByLabelText(/^Caption/).map((el) => (el as HTMLInputElement).value)
    expect(captions).toEqual(['Second', 'Third', 'First'])

    fireEvent.change(screen.getByLabelText('Place (photo 1)'), { target: { value: 'Goa' } })
    fireEvent.click(screen.getByLabelText('Favourite (photo 1)'))
    fireEvent.click(screen.getByRole('button', { name: 'Save moments' }))

    await screen.findByText('Moments saved.')
    const put = calls.find((c) => c.method === 'PUT')!
    expect(put.body).toEqual({
      moments: [
        { mediaId: ULID_B, caption: 'Second', note: null, happenedOn: null, place: 'Goa', favourite: true },
        { mediaId: ULID_C, caption: 'Third', note: null, happenedOn: null, place: null, favourite: false },
        { mediaId: ULID_A, caption: 'First', note: null, happenedOn: null, place: null, favourite: false },
      ],
    })
    expect(put.headers.get('X-XSRF-TOKEN')).toBe('test-token')
  })

  it('removing a moment drops it from the payload', async () => {
    const calls = stubFetch(route('GET', momentsPath, () => json(SERVER)), route('PUT', momentsPath, () => noContent()))
    renderAdmin(<MomentsEditor worldId={WORLD} />)
    await screen.findByLabelText('Caption (photo 1)')
    fireEvent.click(screen.getByRole('button', { name: 'Remove (photo 2)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save moments' }))
    await screen.findByText('Moments saved.')
    const sent = (calls.find((c) => c.method === 'PUT')!.body as { moments: { mediaId: string }[] }).moments
    expect(sent.map((m) => m.mediaId)).toEqual([ULID_A, ULID_C])
  })

  it('409 moments-conflict asks for a reload, which refetches and discards local edits', async () => {
    let gets = 0
    stubFetch(
      route('GET', momentsPath, () => (gets++, json(gets === 1 ? SERVER : [moment('m9', ULID_A, 'Fresh')]))),
      route('PUT', momentsPath, () => problem('moments-conflict', 409)),
    )
    renderAdmin(<MomentsEditor worldId={WORLD} />)
    fireEvent.change(await screen.findByLabelText('Caption (photo 1)'), { target: { value: 'Local edit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save moments' }))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(/changed while you were editing/i)).toBeTruthy()
    fireEvent.click(within(alert).getByRole('button', { name: 'Reload moments' }))
    await waitFor(() => expect((screen.getByLabelText('Caption (photo 1)') as HTMLInputElement).value).toBe('Fresh'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each([
    ['reorder', () => fireEvent.click(screen.getByRole('button', { name: 'Move up (photo 3)' }))],
    ['removal', () => fireEvent.click(screen.getByRole('button', { name: 'Remove (photo 1)' }))],
    ['edit', () => fireEvent.change(screen.getByLabelText('Place (photo 1)'), { target: { value: 'Goa' } })],
  ])('drops stale server field errors after a %s', async (_name, act) => {
    stubFetch(
      route('GET', momentsPath, () => json(SERVER)),
      route('PUT', momentsPath, () =>
        json({ type: 'urn:ourstory:problem:validation-failed', title: 'Bad', status: 400, errors: [{ field: 'moments[1].caption', message: 'too long' }] }, 400),
      ),
    )
    renderAdmin(<MomentsEditor worldId={WORLD} />)
    await screen.findByLabelText('Caption (photo 2)')
    fireEvent.click(screen.getByRole('button', { name: 'Save moments' }))
    await screen.findByText('too long')
    act()
    await waitFor(() => expect(screen.queryByText('too long')).toBeNull())
  })

  it('shows a field error next to the moment it belongs to', async () => {
    stubFetch(
      route('GET', momentsPath, () => json(SERVER)),
      route('PUT', momentsPath, () =>
        json(
          {
            type: 'urn:ourstory:problem:validation-failed',
            title: 'Bad',
            status: 400,
            errors: [{ field: 'moments[1].caption', message: 'size must be between 0 and 500' }],
          },
          400,
        ),
      ),
    )
    renderAdmin(<MomentsEditor worldId={WORLD} />)
    await screen.findByLabelText('Caption (photo 2)')
    fireEvent.click(screen.getByRole('button', { name: 'Save moments' }))
    await screen.findByText('size must be between 0 and 500')
    expect((screen.getByLabelText('Caption (photo 2)') as HTMLInputElement).getAttribute('aria-invalid')).toBe('true')
    expect((screen.getByLabelText('Caption (photo 1)') as HTMLInputElement).getAttribute('aria-invalid')).toBe('false')
  })
})
