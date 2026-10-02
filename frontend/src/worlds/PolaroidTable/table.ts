/** Pure layout logic for the polaroid table: seeded scatter, stacking order, dates. */

/** FNV-1a 32-bit hash of a string. */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32: a tiny deterministic PRNG in [0, 1), seeded by a string. */
export function seededRandom(seed: string): () => number {
  let a = hashString(seed)
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface CardSpot {
  x: number
  y: number
  rotate: number
}

export interface TableLayout {
  cards: CardSpot[]
  cardWidth: number
  cardHeight: number
  height: number
  columns: number
}

export const TABLE_PAD = 22
export const MAX_TILT = 9
/** Polaroid frame below the square photo (caption strip) plus the side borders, in px. */
export const CARD_EXTRA = 46
const MIN_WIDTH = 280
const STAGGER = 0.2
const PHONE_BREAK = 560

/**
 * Scatters cards over a table `tableWidth` px wide. Each card lands in a loose grid cell, jittered and tilted by a
 * PRNG seeded with its id, so the same moments always land in the same places. One column (phones) becomes a loose
 * pile that zig-zags down the table and overlaps a little; every card stays inside the table.
 */
export function layoutTable(ids: readonly string[], tableWidth: number): TableLayout {
  const width = Math.max(MIN_WIDTH, Number.isFinite(tableWidth) ? tableWidth : MIN_WIDTH)
  const cardWidth = width < PHONE_BREAK ? Math.round(Math.min(220, width * 0.58)) : 228
  const cardHeight = cardWidth + CARD_EXTRA
  const inner = width - TABLE_PAD * 2
  const columns = Math.max(1, Math.floor(inner / (cardWidth * 1.04)))
  const cellWidth = inner / columns
  // rows overlap only a little, so each caption strip stays readable under the next card
  const rowStep = columns === 1 ? cardHeight * 0.93 : cardHeight * 1.02
  const maxX = width - TABLE_PAD - cardWidth

  const cards = ids.map((id, i) => {
    const rnd = seededRandom(id)
    const col = i % columns
    const row = Math.floor(i / columns)
    let x: number
    if (columns === 1) {
      const side = i % 2 === 0 ? -0.34 : 0.34
      x = TABLE_PAD + (inner - cardWidth) * (0.5 + side + (rnd() - 0.5) * 0.24)
    } else {
      x = TABLE_PAD + col * cellWidth + (cellWidth - cardWidth) * rnd()
    }
    // odd columns sit a little lower, so the rows never read as a grid
    const stagger = columns > 1 && col % 2 === 1 ? rowStep * STAGGER : 0
    const y = TABLE_PAD + row * rowStep + stagger + (rnd() - 0.5) * rowStep * 0.2
    const rotate = (rnd() * 2 - 1) * MAX_TILT
    return {
      x: Math.round(clamp(x, TABLE_PAD, maxX)),
      y: Math.round(Math.max(TABLE_PAD, y)),
      rotate: Math.round(rotate * 10) / 10,
    }
  })

  const rows = Math.max(1, Math.ceil(ids.length / columns))
  const slack = rowStep * (0.1 + (columns > 1 ? STAGGER : 0))
  const height = Math.round(TABLE_PAD * 2 + (rows - 1) * rowStep + slack + cardHeight + 16)
  return { cards, cardWidth, cardHeight, height, columns }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), Math.max(lo, hi))
}

/** Stacking order with `id` moved to the top (last). Returns a new array. */
export function bringToFront(order: readonly string[], id: string): string[] {
  if (order[order.length - 1] === id) return [...order]
  return [...order.filter((o) => o !== id), id]
}

/** "2 March 2019" from an ISO day (`YYYY-MM-DD`), or null when missing or malformed. */
export function formatDay(day: string | null | undefined): string | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const date = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)
}
