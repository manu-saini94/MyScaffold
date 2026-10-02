// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import AdminApp from './AdminApp'
import { json, problem, renderAdmin, route, stubFetch } from './testSupport'

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

  it('a signed-in admin sees the sections and lands on Import', async () => {
    stubFetch(route('GET', '/api/admin/me', () => json(ME)))
    renderAdmin(mounted)
    expect(await screen.findByRole('heading', { name: 'Import from Google Photos' })).toBeTruthy()
    for (const name of ['Import', 'Library', 'Worlds', 'Letters', 'Settings'])
      expect(screen.getByRole('link', { name })).toBeTruthy()
  })
})
