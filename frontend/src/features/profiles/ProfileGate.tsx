import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, m, useAnimationControls } from 'motion/react'
import { useAppDispatch } from '../../app/hooks'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { useGetExperienceQuery } from '../../services/experienceApi'
import type { Profile } from '../../types/api'
import { chooseProfile } from '../session/sessionSlice'
import { useDefaultTheme } from '../theme/useDefaultTheme'
import { ProfileAvatar } from './ProfileAvatar'
import { splitProfiles } from './profiles'
import styles from './ProfileGate.module.scss'

export const ENTER_MS = 520
export const TEASE_MS = 2600
const BOUNCE = { y: [0, -22, 0, -9, 0], transition: { duration: 0.6, ease: 'easeOut' as const } }
const WIGGLE = { opacity: [1, 0.55, 1], transition: { duration: 0.5 } }

function GateSkeleton() {
  return (
    <div className={styles.list} aria-busy="true">
      <span className={styles.srOnly}>Loading profiles</span>
      <span className={styles.skeleton} aria-hidden="true" />
      <span className={styles.skeleton} aria-hidden="true" />
    </div>
  )
}

function GateError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={styles.errorBox}>
      <p role="alert">We couldn't find the guest list.</p>
      <button type="button" className={styles.retry} onClick={onRetry}>
        Try again
      </button>
    </div>
  )
}

/** "Who's here?": the viewer walks in; the decoy gets a cheeky no and stays put. */
export function ProfileGate() {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const reduced = useReducedMotion()
  const { data, isLoading, isError, refetch } = useGetExperienceQuery()
  const [entering, setEntering] = useState(false)
  const [teaseRun, setTeaseRun] = useState(0)
  const decoyMotion = useAnimationControls()
  const messageId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  useDefaultTheme()

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!entering) return
    const id = window.setTimeout(() => {
      dispatch(chooseProfile('her'))
      void navigate('/')
    }, ENTER_MS)
    return () => window.clearTimeout(id)
  }, [entering, dispatch, navigate])

  useEffect(() => {
    if (teaseRun === 0) return
    const id = window.setTimeout(() => setTeaseRun(0), TEASE_MS)
    return () => window.clearTimeout(id)
  }, [teaseRun])

  const profiles = data?.profiles ?? []
  const { viewer, decoy } = splitProfiles(profiles)
  const teasing = teaseRun > 0

  const choose = (profile: Profile) => {
    if (entering) return
    if (profile.role === 'viewer') return setEntering(true)
    setTeaseRun((n) => n + 1)
    void decoyMotion.start(reduced ? WIGGLE : BOUNCE)
  }

  const tileAnimate = (profile: Profile) => {
    if (profile.role === 'decoy') return entering ? { opacity: 0 } : decoyMotion
    return entering ? { scale: 1.16 } : { scale: 1 }
  }

  const renderList = () => {
    if (isLoading) return <GateSkeleton />
    if (isError) return <GateError onRetry={() => void refetch()} />
    if (profiles.length === 0) return <p className={styles.empty}>No one's on the guest list yet.</p>
    return (
      <ul className={styles.list}>
        {profiles.map((p) => (
          <li key={p.id}>
            <m.button
              type="button"
              className={styles.profile}
              data-role={p.role}
              onClick={() => choose(p)}
              animate={tileAnimate(p)}
              transition={{ duration: ENTER_MS / 1000, ease: [0.16, 1, 0.3, 1] }}
              aria-describedby={p.role === 'decoy' && teasing ? messageId : undefined}
            >
              <ProfileAvatar profile={p} />
              <span className={styles.name}>{p.name}</span>
            </m.button>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <main className={styles.gate} data-entering={entering || undefined}>
      <header className={styles.head}>
        {data?.appTitle && <p className={styles.eyebrow}>{data.appTitle}</p>}
        <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
          Who's here?
        </h1>
      </header>
      {renderList()}
      <div className={styles.messageSlot} role="status" aria-live="polite">
        {/* keyed per tap: a repeat tap remounts the line, so screen readers announce it again */}
        <AnimatePresence mode="wait">
          {teasing && (
            <m.p
              key={teaseRun}
              id={messageId}
              className={styles.message}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
            >
              Nope, this one's for {viewer?.name ?? 'her'} 💌
              {decoy && <span className={styles.messageSub}>Nice try, {decoy.name}.</span>}
            </m.p>
          )}
        </AnimatePresence>
      </div>
    </main>
  )
}
