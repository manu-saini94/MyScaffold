// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { Moment } from '../../types/api'
import { Lightbox } from './Lightbox'
import { momentsToSlides } from './slides'

const loaded = vi.hoisted(() => ({ count: 0 }))
vi.mock('./LightboxImpl', () => {
  loaded.count += 1
  return { default: ({ index, slides }: { index: number; slides: unknown[] }) => <p>viewer {index + 1} of {slides.length}</p> }
})

const moment = (over: Partial<Moment> = {}): Moment => ({
  id: 'm1',
  sortOrder: 1,
  caption: 'First coffee',
  note: 'back of the polaroid',
  happenedOn: '2019-03-02',
  place: 'Pune',
  favourite: false,
  media: { mediaId: 'A', mimeType: 'image/jpeg', width: 4000, height: 3000, lqip: null, dominantColor: null, takenAt: null },
  ...over,
})

afterEach(cleanup)

describe('Lightbox', () => {
  it('loads nothing while closed and the viewer chunk once opened', async () => {
    const slides = momentsToSlides([moment()])
    const { rerender } = render(<Lightbox open={false} slides={slides} index={0} onClose={() => {}} />)
    expect(loaded.count).toBe(0)
    rerender(<Lightbox open slides={slides} index={0} onClose={() => {}} />)
    expect(await screen.findByText('viewer 1 of 1')).toBeTruthy()
    expect(loaded.count).toBe(1)
  })
})

describe('momentsToSlides', () => {
  it('uses the full image with a srcset scaled to the photo and caption text', () => {
    const [s] = momentsToSlides([moment()])
    expect(s).toEqual({
      src: '/api/media/A/full',
      alt: 'First coffee',
      title: 'First coffee',
      description: 'back of the polaroid\nPune · 2019-03-02',
      width: 4000,
      height: 3000,
      srcSet: [
        { src: '/api/media/A/thumb', width: 480, height: 360 },
        { src: '/api/media/A/medium', width: 1280, height: 960 },
        { src: '/api/media/A/full', width: 2560, height: 1920 },
      ],
    })
  })

  it('falls back to a numbered alt and skips srcset without dimensions', () => {
    const bare = moment({
      caption: null,
      note: null,
      place: null,
      happenedOn: null,
      media: { ...moment().media, width: null, height: null },
    })
    const slides = momentsToSlides([moment(), bare])
    expect(slides[1]).toEqual({ src: '/api/media/A/full', alt: 'Photo 2 of 2', title: undefined, description: undefined })
  })
})
