import { readEnv } from '../lib/server/env.js'
import { withErrors, error, json } from '../lib/server/http.js'
import { requireSession } from '../lib/server/auth.js'
import { validateDevice } from '../lib/server/params.js'
import { getModesCollection } from '../lib/server/mongo.js'
import { listModes, setMode } from '../lib/server/modes.js'
import type { AntitheftMode, ModesResponse } from '../lib/shared/types.js'

const MAX_BODY_BYTES = 4 * 1024

export const GET = withErrors(async (request: Request) => {
  const env = readEnv()
  const unauthorized = requireSession(request, env)
  if (unauthorized) return unauthorized

  const col = getModesCollection(env)
  const devices = await listModes(col)
  const response: ModesResponse = { devices }
  return json(response)
})

export const POST = withErrors(async (request: Request) => {
  const env = readEnv()
  const unauthorized = requireSession(request, env)
  if (unauthorized) return unauthorized

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

  const mode = (body as { mode?: unknown } | null)?.mode
  if (mode !== 'armed' && mode !== 'disarmed') {
    return error(400, 'mode must be "armed" or "disarmed"')
  }

  const col = getModesCollection(env)
  const updated = await setMode(col, device, mode as AntitheftMode, new Date())
  if (updated === null) return error(404, 'unknown device')
  return json(updated)
})
