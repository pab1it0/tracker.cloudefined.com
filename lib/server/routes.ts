import type { Collection, Document } from 'mongodb'
import { MAX_PLAUSIBLE_MPS, bboxOf, haversineM } from '../shared/geo.js'
import type { SessionSummary } from '../shared/types.js'

const SESSIONS_LIMIT = 500

function toIsoString(value: unknown): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return value.toISOString()
  }
  if (typeof value === 'string') {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null
    return d.toISOString()
  }
  return null
}

function toNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isLonLat(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  )
}

/** Extracts valid [lon, lat] pairs from a route's raw coordinates array, dropping malformed entries. */
function validCoordinates(route: unknown): [number, number][] {
  const coordinates = (route as { coordinates?: unknown } | null)?.coordinates
  if (!Array.isArray(coordinates)) return []
  return coordinates.filter(isLonLat)
}

/**
 * Maps one row of the `antitheft_routes` aggregation view to a SessionSummary.
 * The view has no per-point timestamps, so distance is estimated by skipping
 * segments whose implied speed (using an evenly-spread dt estimate) exceeds
 * MAX_PLAUSIBLE_MPS — a proxy for a GPS spike.
 */
export function toSessionSummary(row: Document): SessionSummary | null {
  const device = typeof row.device === 'string' ? row.device : null
  const session = typeof row.session === 'string' ? row.session : null
  if (device === null || session === null) return null

  const start = toIsoString(row.start)
  const end = toIsoString(row.end)
  if (start === null || end === null) return null

  const points = typeof row.points === 'number' && Number.isFinite(row.points) ? row.points : 0
  const durationS = Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 1000)
  const estDtS = points > 1 ? durationS / (points - 1) : 0

  const coords = validCoordinates(row.route)

  let distanceM = 0
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1]!
    const cur = coords[i]!
    const distM = haversineM(prev, cur)
    if (estDtS > 0 && distM / estDtS > MAX_PLAUSIBLE_MPS) continue
    distanceM += distM
  }

  // No valid coordinates: keep the session listed (points may still surface via
  // /api/points), but don't give it a bbox that would zoom the map to Null Island.
  const bbox: SessionSummary['bbox'] =
    coords.length > 0 ? bboxOf(coords.map(([lon, lat]) => ({ lon, lat }))) : null

  return {
    id: `${device}|${session}`,
    device,
    session,
    start,
    end,
    points,
    distanceM,
    durationS,
    maxSpeedMps: null,
    batteryStart: null,
    batteryEnd: toNumberOrNull(row.last_battery),
    bbox,
  }
}

export interface SessionsPage {
  sessions: SessionSummary[]
  truncated: boolean
}

/**
 * Session summaries for [from, to] from the `antitheft_routes` view: rows overlapping
 * the range, newest first, capped at SESSIONS_LIMIT. Null-session groups are excluded
 * (the heartbeat always sends a session); those points still surface via /api/points.
 */
export async function sessionsInRange(
  view: Collection<Document>,
  range: { from: Date; to: Date },
): Promise<SessionsPage> {
  const rows = await view
    .find({ session: { $type: 'string' }, start: { $lt: range.to }, end: { $gte: range.from } })
    .sort({ start: -1 })
    .limit(SESSIONS_LIMIT + 1)
    .toArray()

  const truncated = rows.length > SESSIONS_LIMIT
  const sliced = truncated ? rows.slice(0, SESSIONS_LIMIT) : rows
  const sessions = sliced.map(toSessionSummary).filter((s): s is SessionSummary => s !== null)

  return { sessions, truncated }
}
