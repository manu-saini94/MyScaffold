import { useRef } from 'react'
import { flushSync } from 'react-dom'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import { applyTheme, selectTheme, setTheme } from '../../features/theme/themeSlice'
import { prefersReducedMotion } from '../../hooks/useReducedMotion'
import type { ThemeName } from '../../types/world'
import { Rose } from '../Rose/Rose'
import styles from './ThemeToggle.module.scss'

const REVEAL_MS = 650

function farthestCorner(x: number, y: number): number {
  return Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
}

export function ThemeToggle() {
  const dispatch = useAppDispatch()
  const theme = useAppSelector(selectTheme)
  const btnRef = useRef<HTMLButtonElement>(null)
  const next: ThemeName = theme === 'rose' ? 'cinema' : 'rose'

  const commit = () => {
    applyTheme(next)
    dispatch(setTheme(next))
  }

  const onClick = () => {
    const root = document.documentElement
    if (prefersReducedMotion()) return commit()

    if (typeof document.startViewTransition !== 'function') {
      // Fallback: 400ms crossfade of colours, no reveal.
      root.classList.add('theme-fading')
      commit()
      window.setTimeout(() => root.classList.remove('theme-fading'), 450)
      return
    }

    const rect = btnRef.current?.getBoundingClientRect()
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth - 40
    const y = rect ? rect.top + rect.height / 2 : 32
    const radius = farthestCorner(x, y)
    const transition = document.startViewTransition(() => flushSync(commit))
    transition.ready
      .then(() => {
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: REVEAL_MS, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', pseudoElement: '::view-transition-new(root)' },
        )
      })
      .catch(() => undefined)
  }

  return (
    <button
      ref={btnRef}
      type="button"
      className={styles.toggle}
      onClick={onClick}
      aria-label={`Switch to ${next === 'cinema' ? 'Cinema (dark)' : 'Rose (light)'} theme`}
      data-theme-now={theme}
    >
      <span className={`${styles.icon} ${styles.rose}`}>
        <Rose variant="bloom" size={26} />
      </span>
      <svg className={`${styles.icon} ${styles.moon}`} viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
        <path
          d="M20.2 14.6A8.4 8.4 0 0 1 9.4 3.8a8.4 8.4 0 1 0 10.8 10.8Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path d="M17 3.5v3M15.5 5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </button>
  )
}
