// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { ImportPage } from './ImportPage'
import { json, problem, renderAdmin, route, stubFetch } from './testSupport'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const SESSION = {
  sessionId: 'sess-1',
  pickerUri: 'https://photos.example/picker/abc/autoclose',
  pollingConfig: { pollIntervalMs: 20, timeoutMs: 60000 },
  expireTime: '2027-01-01T00:00:00Z',
}
const job = (status: string, done: number) => ({
  jobId: 'job-1',
  status,
  total: 4,
  done,
  failed: 0,
  skipped: 0,
  error: null,
  startedAt: null,
  finishedAt: null,
  failures: [],
})

describe('ImportPage', () => {
  it('walks session -> polling -> import -> live progress', async () => {
    let polls = 0
    let jobReads = 0
    const calls = stubFetch(
      route('POST', '/api/admin/picker/sessions', () => json(SESSION)),
      route('GET', '/api/admin/picker/sessions/sess-1', () => {
        polls++
        return json({ mediaItemsSet: polls >= 3, pollingConfig: polls >= 3 ? null : SESSION.pollingConfig, expireTime: null })
      }),
      route('POST', '/api/admin/picker/sessions/sess-1/import', () => json({ jobId: 'job-1' }, 202)),
      route('GET', '/api/admin/imports/job-1', () => {
        jobReads++
        return json(jobReads === 1 ? job('RUNNING', 1) : job('COMPLETED', 4))
      }),
    )
    renderAdmin(<ImportPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Create picker session' }))

    const open = await screen.findByRole('link', { name: 'Open the picker' })
    expect(open.getAttribute('href')).toBe(SESSION.pickerUri)
    const qr = screen.getByRole('img', { name: /QR code/ })
    expect(qr.tagName.toLowerCase()).toBe('svg')
    expect(qr.querySelector('path')?.getAttribute('d')?.length).toBeGreaterThan(50)

    const start = screen.getByRole('button', { name: 'Start import' }) as HTMLButtonElement
    expect(start.disabled).toBe(true) // nothing picked yet
    await waitFor(() => expect(start.disabled).toBe(false), { timeout: 3000 })
    expect(polls).toBe(3) // polled at the server's pace, stopped once set
    await new Promise((r) => setTimeout(r, 120))
    expect(polls).toBe(3)

    fireEvent.click(start)
    const bar = await screen.findByRole('progressbar', { name: 'Import progress' })
    expect(bar.getAttribute('aria-valuemax')).toBe('4')
    await waitFor(() => expect(screen.getByText('Import finished')).toBeTruthy(), { timeout: 4000 })
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('4')
    expect(calls.find((c) => c.path.endsWith('/import'))?.headers.get('X-XSRF-TOKEN')).toBe('test-token')
  })

  it('409 google-reconnect-required shows the authorize link', async () => {
    stubFetch(
      route('POST', '/api/admin/picker/sessions', () =>
        problem('google-reconnect-required', 409, { authorizeUrl: '/oauth2/authorization/google-picker' }),
      ),
    )
    renderAdmin(<ImportPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Create picker session' }))
    const link = await screen.findByRole('link', { name: 'Reconnect Google Photos' })
    expect(link.getAttribute('href')).toBe('/oauth2/authorization/google-picker')
  })

  it.each(['https://evil.example/x', '/\\evil.example/x', '//evil.example/x', '/oauth2/authorization/google'])(
    'refuses an authorizeUrl other than the picker reconnect path: %s',
    async (authorizeUrl) => {
    stubFetch(
      route('POST', '/api/admin/picker/sessions', () =>
        problem('google-reconnect-required', 409, { authorizeUrl }),
      ),
    )
    renderAdmin(<ImportPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Create picker session' }))
    await screen.findByRole('alert')
    expect(screen.queryByRole('link', { name: 'Reconnect Google Photos' })).toBeNull()
  },
  )
})
