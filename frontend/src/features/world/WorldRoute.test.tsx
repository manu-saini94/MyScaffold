// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { WorldList } from '../launcher/useWorlds'
import { WORLDS_MOCK } from '../launcher/worldsMock'
import WorldRoute from './WorldRoute'

const state = vi.hoisted(() => ({ value: null as unknown }))
vi.mock('../launcher/useWorlds', async (orig) => ({
  ...(await orig<typeof import('../launcher/useWorlds')>()),
  useWorldList: () => state.value,
}))
vi.mock('./WorldView', () => ({ WorldView: ({ world }: { world: { title: string } }) => <p>view {world.title}</p> }))

const list = (over: Partial<WorldList>): WorldList => ({
  worlds: WORLDS_MOCK,
  loading: false,
  isError: false,
  refetch: vi.fn(),
  ...over,
})

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<p>launcher</p>} />
        <Route path="/world/:slug" element={<WorldRoute />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(cleanup)

describe('WorldRoute', () => {
  it('renders nothing while loading, without redirecting', () => {
    state.value = list({ worlds: [], loading: true })
    renderAt('/world/our-firsts')
    expect(screen.queryByText('launcher')).toBeNull()
    expect(screen.queryByText(/view/)).toBeNull()
  })

  it('shows retry on error instead of redirecting, and retries on click', () => {
    const l = list({ worlds: [], isError: true })
    state.value = l
    renderAt('/world/our-firsts')
    expect(screen.queryByText('launcher')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(l.refetch).toHaveBeenCalledTimes(1)
  })

  it('renders the world when open', () => {
    state.value = list({})
    renderAt('/world/our-firsts')
    expect(screen.getByText('view Our Firsts')).toBeTruthy()
  })

  it('redirects home for an unknown slug and for a locked world', () => {
    state.value = list({})
    renderAt('/world/nope')
    expect(screen.getByText('launcher')).toBeTruthy()
    cleanup()
    renderAt('/world/our-forever')
    expect(screen.getByText('launcher')).toBeTruthy()
  })
})
