import { readAntitheftToken, readEnv } from '../lib/server/env.js'
import { withErrors, error, json } from '../lib/server/http.js'
import { checkPassword } from '../lib/server/auth.js'
import { checkRateLimit, clearFailures, clientIp, recordFailure } from '../lib/server/rate-limit.js'
import { validateDevice } from '../lib/server/params.js'
import { getModesCollection } from '../lib/server/mongo.js'
import { checkIn } from '../lib/server/modes.js'
import type { PhoneModeResponse } from '../lib/shared/types.js'

const MAX_BODY_BYTES = 4 * 1024

export const POST = withErrors(async (request: Request) => {
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

  const device = (body as { device?: unknown } | null)?.device
  if (!validateDevice(device)) {
    return error(400, 'device is required')
  }

  const key = `mode:${clientIp(request)}`
  const retryAfterS = checkRateLimit(key)
  if (retryAfterS > 0) {
    return error(429, 'too many attempts', { 'Retry-After': String(retryAfterS) })
  }

  const expected = readAntitheftToken()

  const token = request.headers.get('x-antitheft-token') ?? ''
  if (!token || !checkPassword(token, expected)) {
    recordFailure(key)
    return error(401, 'unauthorized')
  }
  clearFailures(key)

  const env = readEnv()
  const col = getModesCollection(env)
  const result = await checkIn(col, device, new Date())
  const response: PhoneModeResponse = { device: result.device, mode: result.mode, since: result.since }
  return json(response)
})
