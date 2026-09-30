import type { WorldLayout } from '../../types/world'

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/** Simple line glyphs, one per world layout. 24x24 grid, currentColor. */
export function WorldGlyph({ kind, className }: { kind: WorldLayout; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false" {...P}>
      {kind === 'polaroid' && (
        <>
          <rect x="4.5" y="3" width="15" height="18" rx="1.6" />
          <rect x="7" y="5.5" width="10" height="9.5" rx="0.8" />
          <path d="M9 12.6l2.2-2.4 1.9 1.9 1.4-1.4 1.5 1.9" />
          <path d="M8.5 18h4" />
        </>
      )}
      {kind === 'filmstrip' && (
        <>
          <rect x="3" y="6" width="18" height="12" rx="1.6" />
          <path d="M7.5 6v12M16.5 6v12" />
          <path d="M5.2 9h.01M5.2 12h.01M5.2 15h.01M18.8 9h.01M18.8 12h.01M18.8 15h.01" strokeWidth="2" />
          <path d="M10.4 10.2l3.2 1.8-3.2 1.8z" />
        </>
      )}
      {kind === 'postcards' && (
        <>
          <rect x="3" y="5.5" width="18" height="13" rx="1.6" />
          <path d="M12 8.5v7" />
          <path d="M5.8 9.5h3.8M5.8 12h3.8M5.8 14.5h2.4" />
          <rect x="14.6" y="8" width="3.6" height="4" rx="0.6" />
          <path d="M14.6 14.6h4.2" />
        </>
      )}
      {kind === 'memorywall' && (
        <>
          <rect x="3.5" y="4" width="7.2" height="8.4" rx="1" transform="rotate(-6 7 8)" />
          <rect x="13" y="3.5" width="7.5" height="6" rx="1" transform="rotate(5 16.7 6.5)" />
          <rect x="12.5" y="12" width="8" height="8" rx="1" transform="rotate(-4 16.5 16)" />
          <rect x="4" y="14.5" width="6.4" height="5.5" rx="1" transform="rotate(4 7 17)" />
        </>
      )}
      {kind === 'envelope' && (
        <>
          <rect x="3" y="5.5" width="18" height="13" rx="1.8" />
          <path d="M3.6 6.8L12 13l8.4-6.2" />
          <path d="M12 16.6c-1.9-1.2-2.6-2.1-2.6-3.1a1.4 1.4 0 0 1 2.6-.6 1.4 1.4 0 0 1 2.6.6c0 1-.7 1.9-2.6 3.1z" transform="translate(0 -0.2)" />
        </>
      )}
      {kind === 'constellation' && (
        <>
          <path d="M4.5 16.5l4-6 4.5 3.2 3.5-7 3 5.3" />
          <circle cx="4.5" cy="16.5" r="1.3" />
          <circle cx="8.5" cy="10.5" r="1.3" />
          <circle cx="13" cy="13.7" r="1.3" />
          <circle cx="16.5" cy="6.7" r="1.3" />
          <circle cx="19.5" cy="12" r="1.3" />
        </>
      )}
    </svg>
  )
}

export function LockGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false" {...P}>
      <rect x="5" y="10.5" width="14" height="10" rx="2.2" />
      <path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5" />
      <path d="M12 14.6v2.2" />
    </svg>
  )
}

export function HeartGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path
        d="M12 20.4S3.6 15.3 3.6 9.3A4.6 4.6 0 0 1 12 6.9a4.6 4.6 0 0 1 8.4 2.4c0 6-8.4 11.1-8.4 11.1z"
        fill="currentColor"
      />
    </svg>
  )
}
