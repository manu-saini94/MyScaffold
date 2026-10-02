import { useEffect, useRef } from 'react'
import { skyStars, type SkyStar } from './heart'
import styles from './Constellation.module.scss'

const STEADY = skyStars(110, 20261002)
const TWINKLE = skyStars(46, 14022027)

function paint(canvas: HTMLCanvasElement, stars: SkyStar[]) {
  const ctx = canvas.getContext?.('2d')
  const { width, height } = canvas.getBoundingClientRect()
  if (!ctx || !width || !height) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  for (const s of stars) {
    const x = s.x * width
    const y = s.y * height
    if (s.r > 1) {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, s.r * 4)
      glow.addColorStop(0, `rgba(255, 236, 190, ${s.a * 0.5})`)
      glow.addColorStop(1, 'rgba(255, 236, 190, 0)')
      ctx.fillStyle = glow
      ctx.fillRect(x - s.r * 4, y - s.r * 4, s.r * 8, s.r * 8)
    }
    ctx.fillStyle = `rgba(255, 248, 230, ${s.a})`
    ctx.beginPath()
    ctx.arc(x, y, s.r, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * Background stars: two canvases painted once (and again on resize). The second one twinkles with a CSS opacity
 * animation, so the motion costs nothing per frame on the main thread.
 */
export function Sky() {
  const steady = useRef<HTMLCanvasElement>(null)
  const twinkle = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const draw = () => {
      if (steady.current) paint(steady.current, STEADY)
      if (twinkle.current) paint(twinkle.current, TWINKLE)
    }
    draw()
    if (typeof ResizeObserver === 'undefined' || !steady.current) return
    let frame = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(draw)
    })
    ro.observe(steady.current)
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
    }
  }, [])

  return (
    <>
      <canvas ref={steady} className={styles.skyCanvas} aria-hidden="true" />
      <canvas ref={twinkle} className={`${styles.skyCanvas} ${styles.twinkle}`} aria-hidden="true" />
    </>
  )
}
