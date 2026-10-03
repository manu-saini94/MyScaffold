import { useEffect, useRef } from 'react'
import { m } from 'motion/react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import type { Spark } from '../../components/ClickEffects/burstMath'
import { heartPath } from '../../components/Particles/particleMath'
import { RAIN_PER_SECOND, RAIN_SPAWN_MS, rainAlpha, spawnRain, stepRain } from './rainMath'
import styles from './EasterEggs.module.scss'

/** Upper bound for the whole show; also the end when no 2D canvas exists (tests, old browsers). */
export const RAIN_TOTAL_MS = 4200
/** The reduced-motion pulse. */
export const PULSE_MS = 1800
const MAX_DPR = 1.75

/** Runs the rain on `canvas` until it has fallen through; returns a stop function. */
function runRain(canvas: HTMLCanvasElement, c: CanvasRenderingContext2D): () => void {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
  const w = window.innerWidth
  const h = window.innerHeight
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  c.setTransform(dpr, 0, 0, dpr, 0, 0)
  const cs = getComputedStyle(document.documentElement)
  const tones = [cs.getPropertyValue('--accent').trim() || '#b3122f', cs.getPropertyValue('--accent-2').trim() || '#e04a63']

  let pool: Spark[] = []
  let owed = 0
  const start = performance.now()
  let last = start
  let raf = 0
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const spawning = now - start < RAIN_SPAWN_MS
    if (spawning) {
      owed += dt * RAIN_PER_SECOND
      const n = Math.floor(owed)
      owed -= n
      pool = spawnRain(pool, n, w)
    }
    pool = stepRain(pool, dt, h)
    c.clearRect(0, 0, w, h)
    for (const p of pool) {
      c.save()
      c.translate(p.x, p.y)
      c.rotate(p.rot)
      c.globalAlpha = rainAlpha(p) * 0.9
      c.fillStyle = tones[p.tone] ?? '#e04a63'
      heartPath(c, p.size)
      c.fill()
      c.restore()
    }
    raf = spawning || pool.length > 0 ? requestAnimationFrame(frame) : 0
  }
  raf = requestAnimationFrame(frame)
  return () => cancelAnimationFrame(raf)
}

/** Hearts rain over the whole screen for about four seconds, then `onDone`. Reduced motion: one soft pulse. */
export function HeartRain({ onDone }: { onDone: () => void }) {
  const reduced = useReducedMotion()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const done = window.setTimeout(onDone, reduced ? PULSE_MS : RAIN_TOTAL_MS)
    const canvas = canvasRef.current
    const c = reduced || !canvas ? null : canvas.getContext('2d')
    const stop = canvas && c ? runRain(canvas, c) : undefined
    return () => {
      window.clearTimeout(done)
      stop?.()
    }
  }, [reduced, onDone])

  if (reduced) {
    // opacity only, driven by motion (the global reduced-motion CSS rule would flatten a CSS keyframe to nothing)
    return (
      <m.div
        className={styles.pulse}
        aria-hidden="true"
        data-easter-rain="pulse"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: PULSE_MS / 1000 - 0.2, times: [0, 0.35, 1], ease: 'easeInOut' }}
      >
        {Array.from({ length: 7 }, (_, i) => (
          <svg key={i} viewBox="-10 -10 20 20" className={styles.pulseHeart}>
            <path d="M0 8.1C-14.4-.9-6.3-10.8 0-3.2 6.3-10.8 14.4-.9 0 8.1z" />
          </svg>
        ))}
      </m.div>
    )
  }
  return <canvas ref={canvasRef} className={styles.rain} aria-hidden="true" data-easter-rain="rain" />
}
