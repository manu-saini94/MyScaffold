import { useMemo } from 'react'
import { encode } from 'uqr'
import styles from './Admin.module.scss'

const QUIET_ZONE = 2

/** Path data with one 1x1 square per dark module. Built from the matrix, so no markup string is ever injected. */
export function qrPath(matrix: boolean[][]): string {
  let d = ''
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`
    }),
  )
  return d
}

export function QrCode({ value, label }: { value: string; label: string }) {
  const { size, path } = useMemo(() => {
    const { data, size: n } = encode(value, { ecc: 'M', border: 0 })
    return { size: n + QUIET_ZONE * 2, path: qrPath(data) }
  }, [value])
  return (
    <svg
      className={styles.qr}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  )
}
