import { readEnv } from '../lib/server/env.js'
import { withErrors, json, error } from '../lib/server/http.js'
import { requireSession } from '../lib/server/auth.js'
import { parseRange } from '../lib/server/params.js'
import { getRoutesView } from '../lib/server/mongo.js'
import { sessionsInRange } from '../lib/server/routes.js'
import type { SessionsResponse } from '../lib/shared/types.js'
import { SESSIONS_MAX_SPAN_MS } from '../lib/shared/rangeLimits.js'

const DEFAULT_SPAN_MS = 7 * 24 * 60 * 60 * 1000
const MAX_SPAN_MS = SESSIONS_MAX_SPAN_MS

export const GET = withErrors(async (request: Request) => {
  const env = readEnv()
  const unauthorized = requireSession(request, env)
  if (unauthorized) return unauthorized

  const url = new URL(request.url)
  const range = parseRange(url, { defaultSpanMs: DEFAULT_SPAN_MS, maxSpanMs: MAX_SPAN_MS })
  if (!range.ok) return error(400, range.message)

  const view = getRoutesView(env)
  const { sessions, truncated } = await sessionsInRange(view, { from: range.from, to: range.to })

  const response: SessionsResponse = {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    sessions,
    truncated,
  }
  return json(response)
})
