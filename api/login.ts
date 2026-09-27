import { readEnv } from '../lib/server/env.js'
import { withErrors, error, noContent } from '../lib/server/http.js'
import { checkPassword, isSecureRequest, sessionCookie, signSession } from '../lib/server/auth.js'
import { checkRateLimit, clearFailures, clientIp, recordFailure } from '../lib/server/rate-limit.js'

const MAX_BODY_BYTES = 4 * 1024
const FAILURE_DELAY_MS = 600

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const POST = withErrors(async (request: Request) => {
  const env = readEnv()
  const ip = clientIp(request)

  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    return error(400, 'expected application/json body')
  }

  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) {
    return error(400, 'request body too large')
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return error(400, 'invalid JSON body')
  }

  const password = (body as { password?: unknown } | null)?.password
  if (typeof password !== 'string' || password.length === 0) {
    return error(400, 'password is required')
  }

  // Checked here, right before the sync check/verify/recordFailure stretch, so
  // concurrent requests can't all pass the check before a failure is recorded.
  const retryAfterS = checkRateLimit(ip)
  if (retryAfterS > 0) {
    return error(429, 'too many attempts', { 'Retry-After': String(retryAfterS) })
  }

  if (!checkPassword(password, env.trackerPassword)) {
    recordFailure(ip)
    await delay(FAILURE_DELAY_MS)
    return error(401, 'invalid password')
  }

  clearFailures(ip)
  const secure = isSecureRequest(request)
  const value = signSession(env.sessionSecret, Date.now())
  return noContent({ 'Set-Cookie': sessionCookie(value, secure) })
})
