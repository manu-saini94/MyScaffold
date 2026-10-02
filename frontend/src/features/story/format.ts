import type { Remaining } from '../launcher/countdown'

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/

/** "2 March 2019" style for a YYYY-MM-DD date (the visitor's locale); null for anything else. */
export function formatDay(day: string | null, locale?: string): string | null {
  const m = day ? DAY.exec(day) : null
  if (!m) return null
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  if (Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(m[3])) return null
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

const two = (n: number) => String(n).padStart(2, '0')

/** "3d 04h 25m 10s"; days are left out when there are none. */
export function formatRemaining(r: Remaining): string {
  const clock = `${two(r.hours)}h ${two(r.minutes)}m ${two(r.seconds)}s`
  return r.days > 0 ? `${r.days}d ${clock}` : clock
}
