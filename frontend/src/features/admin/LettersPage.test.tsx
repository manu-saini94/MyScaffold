// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { LettersPage } from './LettersPage'
import { json, renderAdmin, route, stubFetch } from './testSupport'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('LettersPage preview', () => {
  it('renders markdown and never raw HTML', async () => {
    stubFetch(route('GET', '/api/admin/letters', () => json([])), route('GET', '/api/admin/worlds', () => json([])))
    const { container } = renderAdmin(<LettersPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'New letter' }))
    fireEvent.change(screen.getByLabelText(/Letter \(markdown\)/), {
      target: { value: 'Hello **bold**\n\n<script>window.pwned = 1</script><img src=x onerror="window.pwned=1">' },
    })
    const preview = screen.getByRole('region', { name: 'Preview' })
    expect(preview.querySelector('strong')?.textContent).toBe('bold')
    expect(container.querySelector('script')).toBeNull()
    expect(preview.querySelector('img')).toBeNull()
    expect(preview.querySelector('[onerror]')).toBeNull()
  })

  it('requires a title before saving', async () => {
    const calls = stubFetch(route('GET', '/api/admin/letters', () => json([])), route('GET', '/api/admin/worlds', () => json([])))
    renderAdmin(<LettersPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'New letter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create letter' }))
    expect(screen.getByText('Title is required.')).toBeTruthy()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })
})
