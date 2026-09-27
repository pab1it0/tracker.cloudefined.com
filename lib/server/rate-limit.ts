const MAX_FAILURES = 5
const WINDOW_MS = 10 * 60 * 1000
const MAX_ENTRIES = 10_000

interface Entry {
  failures: number
  windowStart: number
}

// Per-instance and best-effort: state does not survive a cold start or scale-out on serverless.
const attempts = new Map<string, Entry>()

/** First hop of x-forwarded-for, else x-real-ip, else "unknown". */
export function clientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim()
    if (first) return first
  }
  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  return 'unknown'
}

function evictOldestIfFull(): void {
  if (attempts.size < MAX_ENTRIES) return
  const oldestKey = attempts.keys().next().value
  if (oldestKey !== undefined) attempts.delete(oldestKey)
}

/** Returns retryAfterS > 0 if the key is currently rate-limited, else 0. */
export function checkRateLimit(key: string, now = Date.now()): number {
  const entry = attempts.get(key)
  if (!entry) return 0
  if (now - entry.windowStart > WINDOW_MS) {
    attempts.delete(key)
    return 0
  }
  if (entry.failures >= MAX_FAILURES) {
    return Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000)
  }
  return 0
}

/** Records a login failure for the key, starting/resetting the window as needed. */
export function recordFailure(key: string, now = Date.now()): void {
  const entry = attempts.get(key)
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    evictOldestIfFull()
    attempts.set(key, { failures: 1, windowStart: now })
    return
  }
  entry.failures += 1
}

/** Clears rate-limit state for the key (call on successful login). */
export function clearFailures(key: string): void {
  attempts.delete(key)
}
