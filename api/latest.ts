import { readEnv } from '../lib/server/env.js'
import { withErrors, json } from '../lib/server/http.js'
import { requireSession } from '../lib/server/auth.js'
import { getCollection } from '../lib/server/mongo.js'
import { latestPerDevice } from '../lib/server/points.js'
import type { LatestResponse } from '../lib/shared/types.js'

export const GET = withErrors(async (request: Request) => {
  const env = readEnv()
  const unauthorized = requireSession(request, env)
  if (unauthorized) return unauthorized

  const col = getCollection(env)
  const devices = await latestPerDevice(col)
  const response: LatestResponse = { serverTime: new Date().toISOString(), devices }
  return json(response)
})
