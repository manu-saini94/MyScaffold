/** WCAG 2.x contrast helpers for `#rgb` / `#rrggbb` colours. */

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

function channels(hex: string): [number, number, number] {
  const m = HEX.exec(hex.trim())
  if (!m) throw new Error(`Not a hex colour: ${hex}`)
  const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number]
}

/** Relative luminance (0 = black, 1 = white). */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Contrast ratio between two colours, 1..21. Order does not matter. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** WCAG AA: 4.5:1 for body text, 3:1 for large text (24px+, or 18.66px+ bold). */
export function passesAA(fg: string, bg: string, large = false): boolean {
  return contrastRatio(fg, bg) >= (large ? 3 : 4.5)
}
