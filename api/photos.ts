import { readEnv } from '../lib/server/env.js'
import { withErrors, json, error } from '../lib/server/http.js'
import { requireSession } from '../lib/server/auth.js'
import { parseDevice, parseRange } from '../lib/server/params.js'
import { getPhotosCollection } from '../lib/server/mongo.js'
import { photosInRange } from '../lib/server/photos.js'
import type { PhotosResponse } from '../lib/shared/types.js'
import { SESSIONS_MAX_SPAN_MS } from '../lib/shared/rangeLimits.js'

const DEFAULT_SPAN_MS = 7 * 24 * 60 * 60 * 1000
const MAX_PHOTOS = 300

export const GET = withErrors(async (request: Request) => {
  const env = readEnv()
  const unauthorized = requireSession(request, env)
  if (unauthorized) return unauthorized

  const url = new URL(request.url)
  const range = parseRange(url, { defaultSpanMs: DEFAULT_SPAN_MS, maxSpanMs: SESSIONS_MAX_SPAN_MS })
  if (!range.ok) return error(400, range.message)

  const device = parseDevice(url)
  if (!device.ok) return error(400, device.message)

  const col = getPhotosCollection(env)
  const { photos, truncated } = await photosInRange(
    col,
    { from: range.from, to: range.to, device: device.value },
    MAX_PHOTOS,
  )

  const response: PhotosResponse = {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    photos,
    truncated,
  }
  return json(response)
})
