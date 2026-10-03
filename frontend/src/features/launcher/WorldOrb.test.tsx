// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { LazyMotion, domMax } from 'motion/react'
import { WorldOrb } from './WorldOrb'
import { WORLDS_MOCK } from './worldsMock'

afterEach(cleanup)

function renderOrb(locked: boolean) {
  const world = WORLDS_MOCK[0]!
  render(
    <LazyMotion features={domMax} strict>
      <WorldOrb
        world={world}
        orb={{ key: world.slug, x: 80, y: 80, r: 60, slot: 0 }}
        index={0}
        locked={locked}
        shared={false}
        progress={0}
        covered
        align="center"
        onOpen={vi.fn()}
        onHover={vi.fn()}
      />
    </LazyMotion>,
  )
  return world
}

describe('WorldOrb name tag', () => {
  // the stylesheet shows it only on touch / narrow screens; jsdom can only check it is rendered and kept out of the a11y tree
  it.each([false, true])('renders the world title as a tag under the orb (locked: %s)', (locked) => {
    const world = renderOrb(locked)
    const tag = document.querySelector('[data-name-tag]')
    expect(tag?.textContent).toBe(world.title)
    expect(tag?.getAttribute('aria-hidden')).toBe('true')
    // the button keeps its own accessible name; the tag does not add a second one
    expect(screen.getByRole('button', { name: locked ? `${world.title}, locked` : world.title })).toBeTruthy()
  })
})
