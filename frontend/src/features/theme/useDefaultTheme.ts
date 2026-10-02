import { useEffect, useRef } from 'react'
import { useAppDispatch } from '../../app/hooks'
import { useGetExperienceQuery } from '../../services/experienceApi'
import type { ThemeName } from '../../types/world'
import { applyTheme, hasStoredTheme, setTheme } from './themeSlice'

/** The server's default theme, or null for anything we do not ship. */
export function parseDefaultTheme(value: unknown): ThemeName | null {
  return value === 'rose' || value === 'cinema' ? value : null
}

/** Applies experience.defaultTheme once, and only when the visitor has never chosen a theme. */
export function useDefaultTheme(): void {
  const dispatch = useAppDispatch()
  const { data } = useGetExperienceQuery()
  const done = useRef(false)
  useEffect(() => {
    if (!data || done.current) return
    done.current = true
    if (hasStoredTheme()) return
    const theme = parseDefaultTheme(data.defaultTheme)
    if (!theme) return
    applyTheme(theme)
    dispatch(setTheme(theme))
  }, [data, dispatch])
}
