import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Rose } from '../../components/Rose/Rose'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { useGetQuestionQuery } from '../../services/authApi'
import { AnswerForm } from './AnswerForm'
import { Bloom, BLOOM_MS } from './Bloom'
import { classifyUnlockError } from './unlockOutcome'
import styles from './UnlockScreen.module.scss'

type Phase = 'ask' | 'notConfigured' | 'bloom'

/** `takeFocus`: move focus to the heading, so a screen reader hears why the input just vanished. */
function NotReady({ takeFocus }: { takeFocus: boolean }) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (takeFocus) headingRef.current?.focus()
  }, [takeFocus])
  return (
    <div className={styles.block}>
      <h1 ref={headingRef} tabIndex={-1} className={styles.question}>
        Not quite ready yet
      </h1>
      <p className={styles.lede}>This story is still being wrapped. Come back a little later.</p>
    </div>
  )
}

function QuestionPlaceholder() {
  return (
    <div className={styles.block} aria-busy="true">
      <span className={styles.srOnly}>Loading the question</span>
      <span className={styles.skeleton} aria-hidden="true" />
      <span className={`${styles.skeleton} ${styles.skeletonShort}`} aria-hidden="true" />
    </div>
  )
}

function QuestionError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={styles.block}>
      <p className={styles.lede} role="alert">
        The question got lost on its way here.
      </p>
      <button type="button" className={styles.retry} onClick={onRetry}>
        Try again
      </button>
    </div>
  )
}

/** First screen: one question, one answer. A correct answer blooms the screen open and moves on to /who. */
export function UnlockScreen() {
  const navigate = useNavigate()
  const reduced = useReducedMotion()
  const { data, error, isLoading, isError, refetch } = useGetQuestionQuery()
  const [phase, setPhase] = useState<Phase>('ask')

  useEffect(() => {
    if (phase !== 'bloom') return
    const id = window.setTimeout(() => void navigate('/who'), BLOOM_MS)
    return () => window.clearTimeout(id)
  }, [phase, navigate])

  const questionNotConfigured = isError && classifyUnlockError(error).kind === 'notConfigured'
  const notConfigured = phase === 'notConfigured' || questionNotConfigured

  const renderBody = () => {
    if (notConfigured) return <NotReady takeFocus={phase === 'notConfigured'} />
    if (isLoading) return <QuestionPlaceholder />
    if (isError || !data) return <QuestionError onRetry={() => void refetch()} />
    return (
      <div className={styles.block}>
        <p className={styles.eyebrow}>Just one question</p>
        <h1 className={`${styles.question} ${styles.heartbeat}`}>{data.question}</h1>
        <AnswerForm reduced={reduced} onUnlocked={() => setPhase('bloom')} onNotConfigured={() => setPhase('notConfigured')} />
      </div>
    )
  }

  return (
    <main className={styles.screen}>
      <div className={styles.stage}>
        <Rose variant="bloom" size={56} className={styles.crest} />
        {renderBody()}
      </div>
      {phase === 'bloom' && <Bloom reduced={reduced} />}
    </main>
  )
}
