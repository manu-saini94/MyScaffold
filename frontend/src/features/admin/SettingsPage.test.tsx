// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { SettingsPage } from './SettingsPage'
import { json, renderAdmin, route, stubFetch } from './testSupport'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const SETTINGS = {
  appTitle: 'Anvi and Manu',
  tagline: 'Sample tagline',
  defaultTheme: 'rose',
  specialDate: '2026-02-14',
  herName: 'A',
  myName: 'M',
  easterEggNicknames: [],
  heroMediaIds: [],
  unlockQuestion: 'Sample question?',
  unlockAnswersConfigured: 2,
}

describe('SettingsPage', () => {
  it('never pre-fills answers and says only how many are configured', async () => {
    stubFetch(route('GET', '/api/admin/settings', () => json(SETTINGS)))
    renderAdmin(<SettingsPage />)
    const answers = (await screen.findByLabelText('New unlock answers (one per line)')) as HTMLTextAreaElement
    expect(answers.value).toBe('')
    expect(screen.getByText(/2 answers are set/)).toBeTruthy()
    expect((screen.getByLabelText('Unlock question') as HTMLInputElement).value).toBe('Sample question?')
  })

  it('omits unlockAnswers unless new ones are typed, then sends them once and clears the box', async () => {
    const calls = stubFetch(
      route('GET', '/api/admin/settings', () => json(SETTINGS)),
      route('PUT', '/api/admin/settings', () => json(SETTINGS)),
    )
    renderAdmin(<SettingsPage />)
    const answers = (await screen.findByLabelText('New unlock answers (one per line)')) as HTMLTextAreaElement

    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await screen.findByText('Settings saved.')
    const first = calls.find((c) => c.method === 'PUT')!.body as Record<string, unknown>
    expect(first).not.toHaveProperty('unlockAnswers')
    expect(first).toMatchObject({ appTitle: 'Anvi and Manu', defaultTheme: 'rose', specialDate: '2026-02-14' })

    fireEvent.change(answers, { target: { value: 'Sample\n\n  \nSample two ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() => expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(2))
    expect((calls.filter((c) => c.method === 'PUT')[1]!.body as { unlockAnswers: string[] }).unlockAnswers).toEqual([
      'Sample',
      'Sample two',
    ])
    await waitFor(() => expect(answers.value).toBe(''))
  })

  it('shows the server field error on the setting that failed', async () => {
    stubFetch(
      route('GET', '/api/admin/settings', () => json(SETTINGS)),
      route('PUT', '/api/admin/settings', () =>
        json(
          {
            type: 'urn:ourstory:problem:validation-failed',
            title: 'Bad',
            status: 400,
            errors: [{ field: 'unlockAnswers', message: 'each answer needs at least 4 characters' }],
          },
          400,
        ),
      ),
    )
    renderAdmin(<SettingsPage />)
    fireEvent.change(await screen.findByLabelText('New unlock answers (one per line)'), { target: { value: 'ab' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await screen.findByText('each answer needs at least 4 characters')
    expect(screen.getByLabelText('New unlock answers (one per line)').getAttribute('aria-invalid')).toBe('true')
  })
})
