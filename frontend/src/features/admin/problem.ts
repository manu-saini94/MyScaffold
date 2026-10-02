export interface AdminProblem {
  code: string
  status: number
  detail: string | null
  errors: { field: string; message: string }[]
  authorizeUrl: string | null
  momentCount: number | null
}

const PREFIX = 'urn:ourstory:problem:'
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

function localPath(value: unknown): string | null {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : null
}

/** Narrows an RTK Query error into an RFC 7807 view (contract 1.3). Null for network errors and untyped bodies. */
export function readAdminProblem(error: unknown): AdminProblem | null {
  if (!record(error) || !record(error.data)) return null
  const { type, status, detail, errors, authorizeUrl, momentCount } = error.data
  if (typeof type !== 'string' || typeof status !== 'number') return null
  return {
    code: type.startsWith(PREFIX) ? type.slice(PREFIX.length) : 'unknown',
    status,
    detail: typeof detail === 'string' && detail.trim() ? detail.trim().slice(0, 400) : null,
    errors: Array.isArray(errors)
      ? errors.flatMap((e) =>
          record(e) && typeof e.field === 'string' && typeof e.message === 'string'
            ? [{ field: e.field, message: e.message }]
            : [],
        )
      : [],
    authorizeUrl: localPath(authorizeUrl),
    momentCount: typeof momentCount === 'number' ? momentCount : null,
  }
}

/** HTTP status of a failed request, or null when it never reached the server. */
export function errorStatus(error: unknown): number | null {
  return record(error) && typeof error.status === 'number' ? error.status : null
}

export function describeError(error: unknown): string {
  const problem = readAdminProblem(error)
  if (problem) return problem.detail ?? `Request failed (${problem.code}).`
  if (record(error) && error.status === 'FETCH_ERROR') return 'Cannot reach the server.'
  return 'Something went wrong. Try again.'
}

/** Field messages by field path, e.g. { slug: 'must be kebab-case' }. The first message per field wins. */
export function fieldErrors(error: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  for (const e of readAdminProblem(error)?.errors ?? []) out[e.field] ??= e.message
  return out
}
