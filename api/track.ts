import { readEnv } from '../lib/server/env.js'
import { withErrors, error, json } from '../lib/server/http.js'
import { authorizePhone, readFields } from '../lib/server/phone.js'
import { getCollection, getModesCollection } from '../lib/server/mongo.js'
import { parsePoint } from '../lib/server/ingest.js'
import { upsertPoint } from '../lib/server/points.js'
import { getMode } from '../lib/server/modes.js'

const MAX_BODY_BYTES = 16 * 1024

export const POST = withErrors(async (request: Request) => {
  const parsed = await readFields(request, MAX_BODY_BYTES)
  if (!parsed.ok) return error(parsed.status, parsed.message)

  const point = parsePoint(parsed.value.fields)
  if (!point.ok) return json({ error: 'invalid body', errors: point.errors }, 400)

  const unauthorized = await authorizePhone(request)
  if (unauthorized) return unauthorized

  const env = readEnv()
  const modesCol = getModesCollection(env)
  const mode = await getMode(modesCol, point.value.device)
  if (mode === null || mode.mode !== 'armed') {
    return json({ status: 'disarmed' }, 409)
  }

  const locationsCol = getCollection(env)
  const pointId = await upsertPoint(
    locationsCol,
    {
      device: point.value.device,
      session: point.value.session,
      ts: point.value.ts,
      accuracyM: point.value.accuracyM,
      altitudeM: point.value.altitudeM,
      speedMps: point.value.speedMps,
      battery: point.value.battery,
      lat: point.value.lat,
      lon: point.value.lon,
    },
    new Date(),
  )

  return json({ status: 'stored', point_id: pointId }, 201)
})
