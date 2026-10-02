// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { MediaRef } from '../../types/api'
import { ProgressiveImage } from './ProgressiveImage'

const LQIP = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
const media: MediaRef = { mediaId: '01KMEDIA', width: 4000, height: 3000, lqip: LQIP, dominantColor: '#a1b2c3' }

const frameOf = (img: Element) => img.closest('[data-state]') as HTMLElement

afterEach(cleanup)

describe('ProgressiveImage', () => {
  it('renders a lazy, async, sized image with the full srcset and the caption as alt', () => {
    render(<ProgressiveImage media={media} alt="First coffee" sizes="50vw" />)
    const img = screen.getByAltText('First coffee') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('/api/media/01KMEDIA/medium')
    expect(img.getAttribute('srcset')).toBe(
      '/api/media/01KMEDIA/thumb 480w, /api/media/01KMEDIA/medium 1280w, /api/media/01KMEDIA/full 2560w',
    )
    expect(img.getAttribute('sizes')).toBe('50vw')
    expect(img.getAttribute('loading')).toBe('lazy')
    expect(img.getAttribute('decoding')).toBe('async')
    expect(img.getAttribute('width')).toBe('4000')
    expect(img.getAttribute('height')).toBe('3000')
  })

  it('reserves the aspect ratio and shows the LQIP and dominant colour while loading', () => {
    render(<ProgressiveImage media={media} alt="x" />)
    const frame = frameOf(screen.getByAltText('x'))
    expect(frame.dataset.state).toBe('loading')
    expect(frame.style.aspectRatio).toBe('4000 / 3000')
    expect(frame.style.getPropertyValue('--lqip')).toBe(`url("${LQIP}")`)
    expect(frame.style.backgroundColor).toBe('rgb(161, 178, 195)')
  })

  it('switches to loaded on load', () => {
    render(<ProgressiveImage media={media} alt="x" priority />)
    const img = screen.getByAltText('x')
    expect(img.getAttribute('loading')).toBe('eager')
    fireEvent.load(img)
    expect(frameOf(img).dataset.state).toBe('loaded')
  })

  it('shows a labelled fallback when the image fails', () => {
    const { container } = render(<ProgressiveImage media={media} alt="Lost photo" />)
    fireEvent.error(screen.getByAltText('Lost photo'))
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByRole('img', { name: 'Lost photo' })).toBeTruthy()
    expect((container.firstChild as HTMLElement).dataset.state).toBe('error')
  })

  it('ignores an unsafe LQIP or colour and omits dimensions it does not know', () => {
    const odd: MediaRef = { mediaId: 'M', width: null, height: null, lqip: 'javascript:alert(1)', dominantColor: 'red;x' }
    render(<ProgressiveImage media={odd} alt="x" />)
    const img = screen.getByAltText('x')
    const frame = frameOf(img)
    expect(img.hasAttribute('width')).toBe(false)
    expect(frame.style.aspectRatio).toBe('')
    expect(frame.style.getPropertyValue('--lqip')).toBe('')
    expect(frame.style.backgroundColor).toBe('')
  })
})
