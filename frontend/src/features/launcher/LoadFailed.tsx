/** Quiet retry state for a failed GET /api/experience. */
export function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" style={{ padding: '2rem', textAlign: 'center' }}>
      <p>The story did not load.</p>
      <button type="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  )
}
