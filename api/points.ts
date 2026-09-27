import { readEnv } from '../lib/server/env.js'
import { withErrors, json, error } from '../lib/server/http.js'
import { requireSession } from '../lib/server/auth.js'
import { parseDevice, parseRange, parseSession } from '../lib/server/params.js'
import { getCollection } from '../lib/server/mongo.js'
import { pointsInRange } from '../lib/server/points.js'
import type { PointsResponse } from '../lib/shared/types.js'
import { POINTS_MAX_SPAN_MS } from '../lib/shared/rangeLimits.js'

const DEFAULT_SPAN_MS = 24 * 60 * 60 * 1000
const MAX_SPAN_MS = POINTS_MAX_SPAN_MS
const MAX_POINTS = 20_000

export const GET = withErrors(async (request: Request) => {
  const env = readEnv()
  const unauthorized = requireSession(request, env)
  if (unauthorized) return unauthorized

  const url = new URL(request.url)
  const range = parseRange(url, { defaultSpanMs: DEFAULT_SPAN_MS, maxSpanMs: MAX_SPAN_MS })
  if (!range.ok) return error(400, range.message)

  const device = parseDevice(url)
  if (!device.ok) return error(400, device.message)

  const session = parseSession(url)
  if (!session.ok) return error(400, session.message)

  const col = getCollection(env)
  const { points, truncated } = await pointsInRange(
    col,
    { from: range.from, to: range.to, device: device.value, session: session.value },
    MAX_POINTS,
  )

  const response: PointsResponse = {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    points,
    truncated,
  }
  return json(response)
})
