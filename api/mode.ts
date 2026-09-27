import { readEnv } from '../lib/server/env.js'
import { withErrors, error, json } from '../lib/server/http.js'
import { authorizePhone, readFields, str } from '../lib/server/phone.js'
import { getModesCollection } from '../lib/server/mongo.js'
import { checkIn } from '../lib/server/modes.js'
import type { PhoneModeResponse } from '../lib/shared/types.js'

const MAX_BODY_BYTES = 4 * 1024

export const POST = withErrors(async (request: Request) => {
  const parsed = await readFields(request, MAX_BODY_BYTES)
  if (!parsed.ok) return error(parsed.status, parsed.message)

  const device = str(parsed.value.fields.device, 64)
  if (!device) return error(400, 'device is required')

  const unauthorized = await authorizePhone(request)
  if (unauthorized) return unauthorized

  const env = readEnv()
  const col = getModesCollection(env)
  const result = await checkIn(col, device, new Date())
  const response: PhoneModeResponse = { device: result.device, mode: result.mode, since: result.since }
  return json(response)
})
