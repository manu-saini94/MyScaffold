// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LazyMotion, domMax } from 'motion/react'
import type { Letter, OpenWorldDetail } from '../../types/api'
import { openWorld } from '../world/test-support'
import { deckleClipPath } from './deckle'
import { LetterMarkdown } from './LetterMarkdown'
import { OPENED_KEY, markOpened, readOpened } from './openedStore'
import { OutroLetters, SealedLetters } from './index'

const outroLetter: Letter = {
  id: 'L1',
  title: 'For you',
  body: 'You are *everything*.\n\n- coffee\n- rain\n\n[our song](https://music.example/song)',
  revealTrigger: 'WORLD_OUTRO',
}
const iconLetter: Letter = { id: 'L2', title: 'Psst', body: 'A **secret**.', revealTrigger: 'SEALED_ICON' }
const world = (letters: Letter[]): OpenWorldDetail => openWorld({ letters })

function stubReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

const renderWithMotion = (ui: React.ReactNode) => render(<LazyMotion features={domMax}>{ui}</LazyMotion>)

beforeEach(() => {
  localStorage.clear()
  stubReducedMotion(true)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('LetterMarkdown sanitisation', () => {
  const evil = [
    '# Hello',
    '<script>alert(1)</script>',
    '<iframe src="https://evil.example"></iframe>',
    '<b onclick="alert(1)">raw bold</b>',
    '![photo](https://img.example/x.png)',
    '[bad](javascript:alert(1)) [plain](http://insecure.example) [good](https://ok.example/a)',
    '`code` and *soft* and **strong**',
  ].join('\n\n')

  it('renders no raw HTML, scripts, iframes or images', () => {
    const { container } = render(<LetterMarkdown body={evil} />)
    expect(container.querySelector('script, iframe, img, b, code, pre')).toBeNull()
    expect(container.innerHTML).not.toContain('onclick')
    expect(container.textContent).not.toContain('alert(1)</script>')
    expect(container.querySelector('h1')?.textContent).toBe('Hello')
    expect(container.querySelector('em')?.textContent).toBe('soft')
    expect(container.querySelector('strong')?.textContent).toBe('strong')
  })

  it('keeps only https links, opened safely; others become plain text', () => {
    const { container } = render(<LetterMarkdown body={evil} />)
    const links = [...container.querySelectorAll('a')]
    expect(links).toHaveLength(1)
    expect(links[0]?.getAttribute('href')).toBe('https://ok.example/a')
    expect(links[0]?.getAttribute('rel')).toBe('noopener noreferrer')
    expect(links[0]?.getAttribute('target')).toBe('_blank')
    expect(container.innerHTML).not.toContain('javascript:')
    expect(screen.getByText('bad').tagName).toBe('SPAN')
    expect(screen.getByText('plain').tagName).toBe('SPAN')
  })

  it('renders lists and emphasis', () => {
    const { container } = render(<LetterMarkdown body={outroLetter.body} />)
    expect([...container.querySelectorAll('ul > li')].map((li) => li.textContent)).toEqual(['coffee', 'rain'])
    expect(container.querySelector('em')?.textContent).toBe('everything')
  })
})

describe('opened-state store', () => {
  it('round-trips through localStorage and ignores junk', () => {
    expect(readOpened().size).toBe(0)
    markOpened(readOpened(), 'A')
    expect(readOpened().has('A')).toBe(true)
    localStorage.setItem(OPENED_KEY, '{"not":"an array"}')
    expect(readOpened().size).toBe(0)
    localStorage.setItem(OPENED_KEY, 'not json')
    expect(readOpened().size).toBe(0)
  })

  it('survives blocked storage (keeps the in-memory state)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const next = markOpened(readOpened(), 'A')
    expect(next.has('A')).toBe(true)
  })
})

describe('deckle edge', () => {
  it('is stable per seed and differs between seeds', () => {
    expect(deckleClipPath('L1')).toBe(deckleClipPath('L1'))
    expect(deckleClipPath('L1')).not.toBe(deckleClipPath('L2'))
    expect(deckleClipPath('L1')).toMatch(/^polygon\(/)
  })
})

describe('OutroLetters: seal open flow', () => {
  it('shows only WORLD_OUTRO letters, sealed', () => {
    renderWithMotion(<OutroLetters world={world([outroLetter, iconLetter])} />)
    expect(screen.getByRole('button', { name: /For you/ })).toBeTruthy()
    expect(screen.getByText('Sealed · tap to open')).toBeTruthy()
    expect(screen.queryByText('Psst')).toBeNull()
  })

  it('renders nothing without outro letters', () => {
    const { container } = renderWithMotion(<OutroLetters world={world([iconLetter])} />)
    expect(container.innerHTML).toBe('')
  })

  it('opens a modal dialog, focuses inside, traps Tab, closes on Escape and returns focus', async () => {
    renderWithMotion(<OutroLetters world={world([outroLetter])} />)
    const trigger = screen.getByRole('button', { name: /For you/ })
    trigger.focus()
    fireEvent.click(trigger)

    const dialog = await screen.findByRole('dialog', { name: 'For you' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    const close = screen.getByRole('button', { name: 'Close letter' })
    await waitFor(() => expect(document.activeElement).toBe(close))
    expect(await screen.findByRole('heading', { name: 'For you' })).toBeTruthy()
    expect(screen.getByText('everything').tagName).toBe('EM')

    // Tab from the last focusable (the https link) wraps to the close button, Shift+Tab wraps back
    const link = screen.getByRole('link', { name: 'our song' })
    link.focus()
    fireEvent.keyDown(link, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(link)

    fireEvent.keyDown(link, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(trigger)
  })

  it('plays the seal break first when motion is allowed, then shows the letter', async () => {
    stubReducedMotion(false)
    renderWithMotion(<OutroLetters world={world([outroLetter])} />)
    fireEvent.click(screen.getByRole('button', { name: /For you/ }))
    await screen.findByRole('dialog')
    expect(screen.queryByRole('heading', { name: 'For you' })).toBeNull()
    expect(await screen.findByRole('heading', { name: 'For you' }, { timeout: 3000 })).toBeTruthy()
  })

  it('remembers opened letters and skips the seal break next time', async () => {
    stubReducedMotion(false)
    const first = renderWithMotion(<OutroLetters world={world([outroLetter])} />)
    fireEvent.click(screen.getByRole('button', { name: /For you/ }))
    await screen.findByRole('dialog')
    expect(JSON.parse(localStorage.getItem(OPENED_KEY) ?? '[]')).toEqual(['L1'])
    first.unmount()

    renderWithMotion(<OutroLetters world={world([outroLetter])} />)
    expect(screen.getByText('Opened · read again')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /For you/ }))
    expect(await screen.findByRole('heading', { name: 'For you' })).toBeTruthy()
  })

  it('still opens, and shows opened for the session, when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    renderWithMotion(<OutroLetters world={world([outroLetter])} />)
    fireEvent.click(screen.getByRole('button', { name: /For you/ }))
    expect(await screen.findByRole('heading', { name: 'For you' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close letter' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText('Opened · read again')).toBeTruthy()
  })
})

describe('SealedLetters: corner icon', () => {
  it('floats a sealed envelope per SEALED_ICON letter and opens it', async () => {
    renderWithMotion(<SealedLetters world={world([outroLetter, iconLetter])} />)
    const icon = screen.getByRole('button', { name: 'Open sealed letter: Psst' })
    expect(screen.queryByRole('button', { name: /For you/ })).toBeNull()
    fireEvent.click(icon)
    expect(await screen.findByRole('heading', { name: 'Psst' })).toBeTruthy()
    expect(screen.getByText('secret').tagName).toBe('STRONG')
    fireEvent.click(screen.getByRole('button', { name: 'Close letter' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Read again: Psst' })).toBeTruthy())
  })
})
