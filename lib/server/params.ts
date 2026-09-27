const MIN_DATE = new Date('2020-01-01T00:00:00.000Z').getTime()
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000

export interface RangeOptions {
  defaultSpanMs: number
  maxSpanMs: number
}

export type RangeResult = { ok: true; from: Date; to: Date } | { ok: false; message: string }

function parseDate(value: string): Date | null {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d
}

/** Parses ?from=&to= ISO query params into a validated {from, to} Date range. */
export function parseRange(url: URL, options: RangeOptions): RangeResult {
  const fromRaw = url.searchParams.get('from')
  const toRaw = url.searchParams.get('to')
  const now = Date.now()

  const to = toRaw !== null ? parseDate(toRaw) : new Date(now)
  if (to === null) return { ok: false, message: 'invalid "to" date' }

  const from = fromRaw !== null ? parseDate(fromRaw) : new Date(to.getTime() - options.defaultSpanMs)
  if (from === null) return { ok: false, message: 'invalid "from" date' }

  if (from.getTime() >= to.getTime()) return { ok: false, message: '"from" must be before "to"' }
  if (from.getTime() < MIN_DATE) return { ok: false, message: '"from" is too far in the past' }
  if (to.getTime() > now + MAX_FUTURE_MS) return { ok: false, message: '"to" is too far in the future' }
  if (to.getTime() - from.getTime() > options.maxSpanMs) return { ok: false, message: 'range exceeds max span' }

  return { ok: true, from, to }
}

export type StringResult = { ok: true; value: string } | { ok: false; message: string }

/** Validates an optional ?device= param: <=64 chars, no control characters. */
export function parseDevice(url: URL): { ok: true; value: string | null } | { ok: false; message: string } {
  const raw = url.searchParams.get('device')
  if (raw === null) return { ok: true, value: null }
  if (raw.length === 0 || raw.length > 64) return { ok: false, message: 'invalid "device"' }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw)) return { ok: false, message: 'invalid "device"' }
  return { ok: true, value: raw }
}

const SESSION_RE = /^[A-Za-z0-9-]{1,64}$/

/** Validates an optional ?session= param against a restrictive allowlist pattern. */
export function parseSession(url: URL): { ok: true; value: string | null } | { ok: false; message: string } {
  const raw = url.searchParams.get('session')
  if (raw === null) return { ok: true, value: null }
  if (!SESSION_RE.test(raw)) return { ok: false, message: 'invalid "session"' }
  return { ok: true, value: raw }
}
