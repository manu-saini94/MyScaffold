// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { MIDNIGHT_KEY, restoreMidnight, setMidnight } from './midnight'

const meta = () => document.head.querySelector('meta[name="theme-color"]')!.getAttribute('content')

beforeEach(() => {
  localStorage.clear()
  document.head.innerHTML = '<meta name="theme-color" content="#ffffff">'
  delete document.documentElement.dataset.midnight
})

describe('midnight theme-color', () => {
  it.each([
    ['cinema', '#141414'],
    ['rose', '#ffffff'],
  ])('restores the %s colour when turned off after the pre-paint script already set data-midnight', (theme, colour) => {
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.midnight = 'true' // set by theme-init before the app runs
    localStorage.setItem(MIDNIGHT_KEY, 'true')
    restoreMidnight()
    expect(meta()).toBe('#0c0e2a')
    setMidnight(false)
    expect(meta()).toBe(colour)
  })

  it('goes back to the theme colour after a toggle in the same session', () => {
    document.documentElement.dataset.theme = 'rose'
    setMidnight(true)
    expect(meta()).toBe('#0c0e2a')
    setMidnight(false)
    expect(meta()).toBe('#ffffff')
  })
})
