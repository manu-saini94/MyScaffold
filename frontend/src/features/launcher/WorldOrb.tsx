import { useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import { m } from 'motion/react'
import { LockGlyph, WorldGlyph } from '../../components/WorldIcon/WorldGlyph'
import { mediaUrl } from '../../services/media'
import type { World } from '../../types/world'
import { compactCountdown, orbPhoto, type OrbPhoto } from './orbContent'
import type { Orb } from './scatter'
import { useCountdown } from './useCountdown'
import styles from './WorldOrb.module.scss'

const LONG_PRESS_MS = 450

interface WorldOrbProps {
  world: World
  orb: Orb
  index: number
  locked: boolean
  /**
   * Owns the shared-element layoutId only while the home is active. On a deep link the world frame mounts first; an
   * orb mounting later must not steal its layoutId.
   */
  shared: boolean
  /** 0..1 from the world shell; 0 hides the ring. */
  progress: number
  /** True while an open world covers the home: the countdown stops ticking. */
  covered: boolean
  /** Where the title card hangs: from the orb centre, or from its outer side near a field edge. */
  align: 'start' | 'center' | 'end'
  onOpen: (world: World) => void
  onHover: () => void
}

function formatUnlock(iso: string | null): string {
  if (!iso) return 'a day still to come'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function Photo({ photo, size }: { photo: OrbPhoto; size: number }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading')
  if (state === 'failed') return null
  const lqip = photo.lqip ? ({ backgroundImage: `url("${photo.lqip}")` } as CSSProperties) : undefined
  return (
    <span className={styles.photo} data-loaded={state === 'loaded' || undefined}>
      {lqip && <span className={styles.lqip} style={lqip} />}
      <img
        className={styles.img}
        src={mediaUrl(photo.mediaId, 'thumb')}
        width={size}
        height={size}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onLoad={() => setState('loaded')}
        onError={() => setState('failed')}
      />
    </span>
  )
}

function LockedFace({ unlockAt, covered }: { unlockAt: string | null; covered: boolean }) {
  const r = useCountdown(unlockAt, !covered)
  return (
    <span className={styles.frost}>
      <LockGlyph className={styles.lock} />
      <span className={styles.opens}>opens in</span>
      <span className={styles.timer} role="timer" aria-label={`Opens in ${r.days} days, ${r.hours} hours`}>
        {compactCountdown(r)}
      </span>
    </span>
  )
}

function ProgressRing({ value }: { value: number }) {
  const gid = useId()
  return (
    <svg className={styles.ring} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--romance-1)" />
          <stop offset="0.55" stopColor="var(--romance-2)" />
          <stop offset="1" stopColor="var(--gold-2)" />
        </linearGradient>
      </defs>
      <circle className={styles.track} cx="50" cy="50" r="48" pathLength={1} />
      <circle className={styles.arc} cx="50" cy="50" r="48" pathLength={1} stroke={`url(#${gid})`} strokeDasharray={`${value} 1`} />
    </svg>
  )
}

/** One round world on the home: a photo from inside it (or a gradient), floating; frosted with a countdown when locked. */
export function WorldOrb({ world, orb, index, locked, shared, progress, covered, align, onOpen, onHover }: WorldOrbProps) {
  const [peek, setPeek] = useState(false)
  const press = useRef<{ timer: number; fired: boolean }>({ timer: 0, fired: false })
  const labelId = useId()
  const photo = orbPhoto(world)
  const size = Math.round(orb.r * 2)

  useEffect(() => () => window.clearTimeout(press.current.timer), [])

  const startPress = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return
    press.current.fired = false
    window.clearTimeout(press.current.timer)
    press.current.timer = window.setTimeout(() => {
      press.current.fired = true
      setPeek(true)
    }, LONG_PRESS_MS)
  }
  const endPress = () => window.clearTimeout(press.current.timer)

  const onClick = (e: MouseEvent) => {
    if (press.current.fired) {
      // the long-press already showed the label; this release must not also open the world
      press.current.fired = false
      e.preventDefault()
      return
    }
    if (locked) setPeek((p) => !p)
    else onOpen(world)
  }

  const pct = Math.round(progress * 100)
  const label = locked ? `${world.title}, locked` : world.title
  const style = {
    left: orb.x - orb.r,
    top: orb.y - orb.r,
    width: size,
    height: size,
    '--i': index,
    '--float-dur': `${6.5 + (index % 3) * 1.4}s`,
    '--float-delay': `${-index * 1.7}s`,
    '--tint-a': world.tint[0],
    '--tint-b': world.tint[1],
    ...(photo?.color ? { '--photo-colour': photo.color } : {}),
  } as CSSProperties

  return (
    <div className={styles.slot} style={style} data-align={align} data-peek={peek || undefined} onMouseLeave={() => setPeek(false)}>
      <div className={styles.float}>
        <button
          type="button"
          className={`${styles.orb} ${locked ? styles.locked : ''}`}
          data-orb={index}
          aria-label={label}
          aria-describedby={labelId}
          onClick={onClick}
          onPointerEnter={onHover}
          onPointerDown={startPress}
          onPointerUp={endPress}
          onPointerCancel={endPress}
          onPointerLeave={endPress}
          onBlur={() => setPeek(false)}
        >
          <m.span layoutId={shared ? `world-${world.slug}` : undefined} className={styles.disc} style={{ borderRadius: 999 }} />
          {/* orbPhoto is always null for a locked world */}
          {photo ? (
            <Photo key={photo.mediaId} photo={photo} size={size} />
          ) : (
            !locked && <WorldGlyph kind={world.layout} className={styles.glyph} />
          )}
          {locked && <LockedFace unlockAt={world.unlockAt} covered={covered} />}
          {pct > 0 && !locked && <ProgressRing value={progress} />}
        </button>
        <div className={styles.label} id={labelId}>
          <p className={styles.title}>{world.title}</p>
          <p className={styles.sub}>
            {locked ? `Opens on ${formatUnlock(world.unlockAt)}` : world.subtitle}
          </p>
          {pct > 0 && !locked && <p className={styles.seen}>{pct}% seen</p>}
        </div>
      </div>
    </div>
  )
}
