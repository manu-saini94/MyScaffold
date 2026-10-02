import type { ReactNode } from 'react'
import styles from './Story.module.scss'

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d={d} fill="currentColor" />
    </svg>
  )
}

const ICONS = {
  play: 'M8 5.5v13l10.5-6.5z',
  pause: 'M7 5h3.6v14H7zM13.4 5H17v14h-3.6z',
  prev: 'M6 5h2.2v14H6zM19 5.5v13L9.6 12z',
  next: 'M15.8 5H18v14h-2.2zM5 5.5v13L14.4 12z',
  skip: 'M4 5.5v13L11.5 12zM12 5.5v13L19.5 12zM19.6 5h1.9v14h-1.9z',
  close: 'M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z',
  sound: 'M4 9h4l5-4v14l-5-4H4zM16 8.5a5 5 0 0 1 0 7l-1.2-1.2a3.3 3.3 0 0 0 0-4.6zM18.4 6a8.5 8.5 0 0 1 0 12l-1.2-1.2a6.8 6.8 0 0 0 0-9.6z',
  muted: 'M4 9h4l5-4v14l-5-4H4zM15.3 9.2l1.2-1.2 2.3 2.3 2.3-2.3 1.2 1.2-2.3 2.3 2.3 2.3-1.2 1.2-2.3-2.3-2.3 2.3-1.2-1.2 2.3-2.3z',
}

function ControlButton({ label, onClick, children, pressed, wide }: { label: string; onClick: () => void; children: ReactNode; pressed?: boolean; wide?: boolean }) {
  return (
    <button type="button" className={wide ? `${styles.control} ${styles.controlMain}` : styles.control} aria-label={label} aria-pressed={pressed} title={label} onClick={onClick}>
      {children}
    </button>
  )
}

export interface ChapterProgress {
  label: string
  /** Slides in this chapter (1 while it is still loading). */
  count: number
  current: number
  /** 0..1 through the current slide. */
  fraction: number
}

/** Top bar: chapter name, one segment per slide (the current one fills as it plays) and Exit. */
export function TopBar({ progress, onExit }: { progress: ChapterProgress | null; onExit: () => void }) {
  return (
    <div className={styles.topBar}>
      {progress ? (
        <div className={styles.progressWrap}>
          <p className={styles.chapterLabel}>{progress.label}</p>
          <div
            className={styles.segments}
            role="progressbar"
            aria-label="Chapter progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(((progress.current + progress.fraction) / progress.count) * 100)}
          >
            {Array.from({ length: progress.count }, (_, i) => (
              <span key={i} className={styles.segment}>
                <span
                  className={styles.segmentFill}
                  style={{ transform: `scaleX(${i < progress.current ? 1 : i === progress.current ? progress.fraction : 0})` }}
                />
              </span>
            ))}
          </div>
        </div>
      ) : (
        <span className={styles.progressWrap} />
      )}
      <ControlButton label="Exit story (Esc)" onClick={onExit}>
        <Icon d={ICONS.close} />
      </ControlButton>
    </div>
  )
}

interface BottomProps {
  playing: boolean
  ended: boolean
  music: boolean
  muted: boolean
  onToggle: () => void
  onPrev: () => void
  onNext: () => void
  onSkip: () => void
  onMute: () => void
}

export function BottomBar({ playing, ended, music, muted, onToggle, onPrev, onNext, onSkip, onMute }: BottomProps) {
  return (
    <div className={styles.bottomBar}>
      <ControlButton label="Previous photo (Left arrow)" onClick={onPrev}>
        <Icon d={ICONS.prev} />
      </ControlButton>
      {!ended && (
        <ControlButton label={playing ? 'Pause (Space)' : 'Play (Space)'} onClick={onToggle} wide>
          <Icon d={playing ? ICONS.pause : ICONS.play} />
        </ControlButton>
      )}
      {!ended && (
        <ControlButton label="Next photo (Right arrow)" onClick={onNext}>
          <Icon d={ICONS.next} />
        </ControlButton>
      )}
      {!ended && (
        <ControlButton label="Skip chapter (N)" onClick={onSkip}>
          <Icon d={ICONS.skip} />
        </ControlButton>
      )}
      {music && (
        // a toggle keeps one name; aria-pressed carries the state
        <ControlButton label="Mute music" onClick={onMute} pressed={muted}>
          <Icon d={muted ? ICONS.muted : ICONS.sound} />
        </ControlButton>
      )}
    </div>
  )
}
