// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import AdminApp from './AdminApp'
import { json, noContent, problem, renderAdmin, route, stubFetch } from './testSupport'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const mounted = (
  <Routes>
    <Route path="/admin/*" element={<AdminApp />} />
  </Routes>
)
const ME = { email: 'admin@example.com', name: 'Manu', admin: true, pickerConnected: false }

describe('AdminApp sign-in states', () => {
  it('401 offers the Google sign-in link', async () => {
    stubFetch(route('GET', '/api/admin/me', () => problem('unauthorized', 401)))
    renderAdmin(mounted)
    const link = await screen.findByRole('link', { name: 'Sign in with Google' })
    expect(link.getAttribute('href')).toBe('/oauth2/authorization/google')
  })

  it('403 says the account is not the admin and offers no import UI', async () => {
    stubFetch(route('GET', '/api/admin/me', () => problem('forbidden', 403)))
    renderAdmin(mounted)
    expect(await screen.findByText(/not allowed to use the admin area/i)).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Admin sections' })).toBeNull()
  })

  it('an expired session on an admin call says so and falls back to the sign-in state', async () => {
    let signedIn = true
    stubFetch(
      route('GET', '/api/admin/me', () => (signedIn ? json(ME) : problem('unauthorized', 401))),
      route('GET', '/api/admin/settings', () =>
        json({ appTitle: 'T', tagline: '', defaultTheme: 'rose', specialDate: '', herName: '', myName: '', easterEggNicknames: [], heroMediaIds: [], unlockQuestion: null, unlockAnswersConfigured: 0 }),
      ),
      route('PUT', '/api/admin/settings', () => {
        signedIn = false
        return new Response(null, { status: 401 })
      }),
    )
    renderAdmin(mounted, '/admin/settings')
    fireEvent.click(await screen.findByRole('button', { name: 'Save settings' }))
    expect(await screen.findByText('Your session expired.')).toBeTruthy()
    expect(await screen.findByRole('link', { name: 'Sign in with Google' })).toBeTruthy()
  })

  it.each([
    ['204', () => noContent()],
    ['302 redirect', () => new Response(null, { status: 302, headers: { location: '/' } })],
  ])('Sign out posts /logout with the CSRF header and shows the signed-out state (%s)', async (_name, respond) => {
    let signedIn = true
    const calls = stubFetch(
      route('GET', '/api/admin/me', () => (signedIn ? json(ME) : problem('unauthorized', 401))),
      route('POST', '/logout', () => {
        signedIn = false
        return respond()
      }),
    )
    renderAdmin(mounted)
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('link', { name: 'Sign in with Google' })).toBeTruthy()
    const logout = calls.find((c) => c.path === '/logout')!
    expect(logout.method).toBe('POST')
    expect(logout.headers.get('X-XSRF-TOKEN')).toBe('test-token')
  })

  it('a signed-in admin sees the sections and lands on Import', async () => {
    stubFetch(route('GET', '/api/admin/me', () => json(ME)))
    renderAdmin(mounted)
    expect(await screen.findByRole('heading', { name: 'Import from Google Photos' })).toBeTruthy()
    for (const name of ['Import', 'Library', 'Worlds', 'Letters', 'Settings'])
      expect(screen.getByRole('link', { name })).toBeTruthy()
  })
})
