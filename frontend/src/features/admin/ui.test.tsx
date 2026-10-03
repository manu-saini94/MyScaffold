// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ConfirmButton } from './ui'

afterEach(cleanup)

const renderButton = (onConfirm = () => {}) =>
  render(<ConfirmButton label="Delete" confirmLabel="Yes, delete" onConfirm={onConfirm} />)

describe('ConfirmButton focus', () => {
  it('returns focus to the trigger after Cancel', () => {
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete' }))
  })

  it('returns focus to the trigger after confirming, and still confirms', () => {
    let confirmed = 0
    renderButton(() => confirmed++)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' }))
    expect(confirmed).toBe(1)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete' }))
  })

  it('moves focus into the confirm group when asking', () => {
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Yes, delete' }))
  })
})
