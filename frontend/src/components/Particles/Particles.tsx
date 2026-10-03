import { useEffect, useRef } from 'react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import type { ParticleKind } from '../../types/world'
import { createParticle, drawParticle, stepParticle, type Particle } from './particleMath'
import styles from './Particles.module.scss'

interface ParticlesProps {
  /** Changing `kind` swaps the effect in place; the canvas is never remounted. */
  kind: ParticleKind
  /** Stops the loop (the last frame stays) while something covers the layer, e.g. an open world. */
  paused?: boolean
}

const MAX_DPR = 1.75

function readColors(): [string, string] {
  const cs = getComputedStyle(document.documentElement)
  return [cs.getPropertyValue('--accent').trim() || '#b3122f', cs.getPropertyValue('--accent-2').trim() || '#e04a63']
}

/** Tiny hand-written Canvas 2D particle layer: falling petals (Rose) / rising embers + hearts (Cinema). */
export function Particles({ kind, paused = false }: ParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const kindRef = useRef(kind)
  const pausedRef = useRef(paused)
  const syncRef = useRef(() => {})
  const reduced = useReducedMotion()

  useEffect(() => {
    kindRef.current = kind
  }, [kind])

  useEffect(() => {
    pausedRef.current = paused
    syncRef.current()
  }, [paused])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || reduced) return

    let w = 0
    let h = 0
    let dpr = 1
    let raf = 0
    let last = performance.now()
    let particles: Particle[] = []
    let activeKind = kindRef.current
    let colors = readColors()

    const seed = () => {
      const count = Math.round(Math.min(46, Math.max(16, (w * h) / 26000)))
      particles = Array.from({ length: count }, () => createParticle(activeKind, w, h, true))
    }

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      seed()
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (kindRef.current !== activeKind) {
        activeKind = kindRef.current
        colors = readColors()
        seed()
      }
      ctx.clearRect(0, 0, w, h)
      for (const p of particles) {
        stepParticle(p, dt, now / 1000, w, h, activeKind)
        drawParticle(ctx, p, activeKind, colors)
      }
    }

    // runs only while the tab is visible and nothing covers the layer
    const sync = () => {
      cancelAnimationFrame(raf)
      raf = 0
      if (!document.hidden && !pausedRef.current) {
        last = performance.now()
        raf = requestAnimationFrame(frame)
      }
    }

    resize()
    sync()
    syncRef.current = sync
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', sync)
    return () => {
      syncRef.current = () => {}
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [reduced])

  return <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
}
