import { num, str } from './phone.js'

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] }

const SESSION_RE = /^[A-Za-z0-9-]{1,64}$/
const TRACK_SKEW_MS = 15 * 60 * 1000
const ALERT_SKEW_MS = 60 * 60 * 1000

function parseTs(raw: unknown, skewMs: number, now: Date, errors: string[], field: string): Date | null {
  if (typeof raw !== 'string' || raw.trim() === '') {
    errors.push(`${field} is required`)
    return null
  }
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) {
    errors.push(`${field} must be a valid ISO date`)
    return null
  }
  if (Math.abs(d.getTime() - now.getTime()) > skewMs) {
    errors.push(`${field} is too far from server time`)
    return null
  }
  return d
}

export interface PointInput {
  ts: Date
  lat: number
  lon: number
  accuracyM: number | null
  altitudeM: number | null
  speedMps: number | null
  battery: number | null
  device: string
  session: string | null
}

/** Validates a POST /api/track body. Mirrors the old n8n Function-node validators. */
export function parsePoint(fields: Record<string, string>, now = new Date()): ParseResult<PointInput> {
  const errors: string[] = []

  const ts = parseTs(fields.ts, TRACK_SKEW_MS, now, errors, 'ts')

  const lat = num(fields.lat, -90, 90)
  const lon = num(fields.lon, -180, 180)
  if (lat === null) errors.push('lat is required and must be between -90 and 90')
  if (lon === null) errors.push('lon is required and must be between -180 and 180')
  if (lat === 0 && lon === 0) errors.push('lat/lon cannot both be 0')

  const accuracyM = num(fields.accuracy_m, 0, 1_000_000)
  const altitudeM = num(fields.altitude_m, -1000, 10_000)
  const speedMps = num(fields.speed_mps, 0, 1000)
  const battery = num(fields.battery, 0, 100)

  const device = str(fields.device, 64) || 'iPhone'

  let session: string | null = null
  const sessionRaw = fields.session
  if (sessionRaw !== undefined && sessionRaw !== '') {
    if (!SESSION_RE.test(sessionRaw)) errors.push('session is invalid')
    else session = sessionRaw
  }

  if (errors.length > 0 || ts === null || lat === null || lon === null || (lat === 0 && lon === 0)) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    value: { ts, lat, lon, accuracyM, altitudeM, speedMps, battery, device, session },
  }
}

const TRIGGERS = ['charger', 'airplane', 'battery', 'heartbeat', 'manual'] as const
export type AlertTrigger = (typeof TRIGGERS)[number]

export interface AlertInput {
  trigger: AlertTrigger
  timestamp: Date
  nonce: string | null
  lat: number | null
  lon: number | null
  accuracyM: number | null
  battery: number | null
  ssid: string | null
  device: string
}

function isAlertTrigger(v: string): v is AlertTrigger {
  return (TRIGGERS as readonly string[]).includes(v)
}

/** Validates a POST /api/alert body. Mirrors the old n8n Function-node validators. */
export function parseAlert(fields: Record<string, string>, now = new Date()): ParseResult<AlertInput> {
  const errors: string[] = []

  const triggerRaw = fields.trigger?.trim() || 'manual'
  if (!isAlertTrigger(triggerRaw)) errors.push('trigger must be one of charger|airplane|battery|heartbeat|manual')
  const trigger = isAlertTrigger(triggerRaw) ? triggerRaw : 'manual'

  const timestamp = parseTs(fields.timestamp, ALERT_SKEW_MS, now, errors, 'timestamp')

  const nonce = fields.nonce ? str(fields.nonce, 128) : null

  const lat = num(fields.lat, -90, 90)
  const lon = num(fields.lon, -180, 180)
  const accuracyM = num(fields.accuracy_m, 0, 1_000_000)
  const battery = num(fields.battery, 0, 100)

  const ssid = fields.ssid !== undefined ? str(fields.ssid, 64) : null

  const device = str(fields.device, 64) || 'iPhone'

  if (errors.length > 0 || timestamp === null) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    value: { trigger, timestamp, nonce, lat, lon, accuracyM, battery, ssid, device },
  }
}
