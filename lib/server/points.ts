import type { Collection, Document } from 'mongodb'
import type { LatestPoint, TrackPoint } from '../shared/types.js'

/** Projection used by all point queries: only the fields TrackPoint needs. */
export const POINT_PROJECTION = {
  _id: 0,
  device: 1,
  session: 1,
  ts: 1,
  loc: 1,
  accuracy_m: 1,
  altitude_m: 1,
  speed_mps: 1,
  battery: 1,
} as const

const LATEST_LIMIT = 20

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

/** Maps a raw Mongo document to a TrackPoint, or null if ts/loc are invalid. */
export function toTrackPoint(doc: Document): TrackPoint | null {
  const t = toIsoString(doc.ts)
  if (t === null) return null

  const loc = doc.loc as { type?: unknown; coordinates?: unknown } | undefined
  if (!loc || loc.type !== 'Point' || !Array.isArray(loc.coordinates) || loc.coordinates.length !== 2) {
    return null
  }
  const [lon, lat] = loc.coordinates as [unknown, unknown]
  if (typeof lon !== 'number' || typeof lat !== 'number' || !Number.isFinite(lon) || !Number.isFinite(lat)) {
    return null
  }

  const device = typeof doc.device === 'string' ? doc.device : null
  if (device === null) return null

  return {
    t,
    lat,
    lon,
    acc: toNumberOrNull(doc.accuracy_m),
    alt: toNumberOrNull(doc.altitude_m),
    spd: toNumberOrNull(doc.speed_mps),
    bat: toNumberOrNull(doc.battery),
    session: typeof doc.session === 'string' ? doc.session : null,
    device,
  }
}

/**
 * Latest point per device: match well-formed docs first so the index on
 * {device, ts} can be used, group per device (newest first), then sort and
 * limit the small per-device result set instead of the whole collection.
 */
export async function latestPerDevice(col: Collection<Document>): Promise<LatestPoint[]> {
  const docs = await col
    .aggregate([
      { $match: { device: { $type: 'string' }, ts: { $type: 'date' }, 'loc.type': 'Point' } },
      { $sort: { device: 1, ts: -1 } },
      { $group: { _id: '$device', doc: { $first: '$$ROOT' } } },
      { $sort: { 'doc.ts': -1 } },
      { $limit: LATEST_LIMIT },
    ])
    .toArray()

  const points: LatestPoint[] = []
  for (const wrapper of docs) {
    const doc = wrapper.doc as Document
    const point = toTrackPoint(doc)
    if (point === null) continue
    const receivedAt = toIsoString(doc.received_at) ?? point.t
    points.push({ ...point, receivedAt })
  }
  return points
}

export interface PointsRangeQuery {
  from: Date
  to: Date
  device?: string | null
  session?: string | null
}

export interface PointsPage {
  points: TrackPoint[]
  truncated: boolean
}

/** Points in [from, to] ascending by ts, optionally filtered by device/session, capped at limit. */
export async function pointsInRange(
  col: Collection<Document>,
  query: PointsRangeQuery,
  limit: number,
): Promise<PointsPage> {
  const filter: Document = { ts: { $gte: query.from, $lte: query.to } }
  if (query.device) filter.device = query.device
  if (query.session) filter.session = query.session

  // Sort newest-first so a truncated result keeps the latest points (the ones
  // that matter most), then reverse back to ascending order for the response.
  const docs = await col
    .find(filter, { projection: POINT_PROJECTION })
    .sort({ ts: -1 })
    .limit(limit + 1)
    .toArray()

  const truncated = docs.length > limit
  const sliced = (truncated ? docs.slice(0, limit) : docs).reverse()
  const points = sliced.map(toTrackPoint).filter((p): p is TrackPoint => p !== null)
  return { points, truncated }
}

