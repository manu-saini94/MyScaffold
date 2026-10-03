// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LazyMotion, domMax } from 'motion/react'
import { installDomStubs, moment, openWorld, showAll } from '../../features/world/test-support'
import type { Moment } from '../../types/api'
import MemoryWall from './index'

function renderWall(moments: Moment[]) {
  const onFinished = vi.fn()
  const onOpenPhoto = vi.fn()
  const view = render(
    <LazyMotion features={domMax} strict>
      <MemoryWall world={openWorld({ layout: 'MEMORY_WALL', moments })} onFinished={onFinished} onOpenPhoto={onOpenPhoto} />
    </LazyMotion>,
  )
  return { ...view, onFinished, onOpenPhoto }
}

beforeEach(() => installDomStubs())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('MemoryWall', () => {
  it('pins every moment and opens the one that was pressed', () => {
    const moments = Array.from({ length: 7 }, (_, i) => moment(i + 1))
    const { onOpenPhoto } = renderWall(moments)
    expect(screen.getAllByRole('listitem')).toHaveLength(7)
    fireEvent.click(screen.getByRole('button', { name: 'Open Moment 5' }))
    expect(onOpenPhoto).toHaveBeenCalledWith(4)
  })

  it('keeps captions as handwritten notes on the prints', () => {
    renderWall([moment(1)])
    expect(screen.getByText('Moment 1')).toBeTruthy()
  })

  it('finishes once the bottom of the wall is in view', async () => {
    const { onFinished } = renderWall([moment(1), moment(2)])
    expect(onFinished).not.toHaveBeenCalled()
    await waitFor(() => {
      showAll()
      expect(onFinished).toHaveBeenCalledTimes(1)
    })
  })

  it('names uncaptioned photos by position', () => {
    const { onOpenPhoto } = renderWall([moment(1), { ...moment(2), caption: null }])
    fireEvent.click(screen.getByRole('button', { name: 'Open Photo 2 of 2' }))
    expect(onOpenPhoto).toHaveBeenCalledWith(1)
  })

  it('finishes at once and shows a gentle note when there are no moments', () => {
    const { onFinished } = renderWall([])
    expect(onFinished).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Nothing pinned up here yet.')).toBeTruthy()
  })
})
