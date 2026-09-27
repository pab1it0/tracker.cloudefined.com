import type { SessionSummary } from './types.js'

const EARTH_RADIUS_M = 6_371_000

export const MAX_PLAUSIBLE_MPS = 70
export const MIN_DT_S = 5

/** Great-circle distance between two [lon, lat] points, in meters. */
export function haversineM(a: [number, number], b: [number, number]): number {
  const [lon1, lat1] = a
  const [lon2, lat2] = b
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const dPhi = ((lat2 - lat1) * Math.PI) / 180
  const dLambda = ((lon2 - lon1) * Math.PI) / 180

  const sinDPhi = Math.sin(dPhi / 2)
  const sinDLambda = Math.sin(dLambda / 2)
  const h = sinDPhi * sinDPhi + Math.cos(phi1) * Math.cos(phi2) * sinDLambda * sinDLambda
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
  return EARTH_RADIUS_M * c
}

interface TimedPoint {
  t: string
  lat: number
  lon: number
}

function median3(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}

/**
 * Per-point speed derived from the previous point. Index 0 is always null.
 * A segment is null when the elapsed time is below MIN_DT_S or the implied
 * speed exceeds MAX_PLAUSIBLE_MPS (GPS jump). Result is 3-point median smoothed,
 * ignoring nulls in the window.
 */
export function deriveSpeeds(points: TimedPoint[]): (number | null)[] {
  const raw: (number | null)[] = points.map((point, i) => {
    if (i === 0) return null
    const prev = points[i - 1]!
    const dtS = (new Date(point.t).getTime() - new Date(prev.t).getTime()) / 1000
    if (dtS < MIN_DT_S) return null
    const distM = haversineM([prev.lon, prev.lat], [point.lon, point.lat])
    const speed = distM / dtS
    if (speed > MAX_PLAUSIBLE_MPS) return null
    return speed
  })

  return raw.map((_, i) => {
    if (i === 0) return null
    const window = [raw[i - 1], raw[i], raw[i + 1]].filter(
      (v): v is number => v !== null && v !== undefined,
    )
    if (window.length === 0) return null
    return median3(window)
  })
}

/** Sum of haversine distances over segments whose implied speed is plausible. */
export function pathDistanceM(points: TimedPoint[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!
    const point = points[i]!
    const dtS = (new Date(point.t).getTime() - new Date(prev.t).getTime()) / 1000
    const distM = haversineM([prev.lon, prev.lat], [point.lon, point.lat])
    if (dtS > 0 && distM / dtS > MAX_PLAUSIBLE_MPS) continue
    total += distM
  }
  return total
}

interface GroupablePoint {
  t: string
  device: string
  session: string | null
}

/**
 * Groups points by device+session. Null-session points are split per device
 * by time gaps greater than gapMs. Each group is sorted ascending by t; groups
 * are returned in ascending start order.
 */
export function groupSessions<T extends GroupablePoint>(points: T[], gapMs = 15 * 60_000): T[][] {
  const byKey = new Map<string, T[]>()

  for (const point of points) {
    const key = point.session !== null ? `s:${point.device}|${point.session}` : `n:${point.device}`
    const list = byKey.get(key)
    if (list) list.push(point)
    else byKey.set(key, [point])
  }

  const groups: T[][] = []

  for (const [key, groupPoints] of byKey) {
    groupPoints.sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime())

    if (key.startsWith('s:')) {
      groups.push(groupPoints)
      continue
    }

    let current: T[] = []
    for (const point of groupPoints) {
      if (current.length === 0) {
        current.push(point)
        continue
      }
      const prevT = new Date(current[current.length - 1]!.t).getTime()
      const dt = new Date(point.t).getTime() - prevT
      if (dt > gapMs) {
        groups.push(current)
        current = [point]
      } else {
        current.push(point)
      }
    }
    if (current.length > 0) groups.push(current)
  }

  groups.sort((a, b) => new Date(a[0]!.t).getTime() - new Date(b[0]!.t).getTime())
  return groups
}

/** Stable id for a session group: `device|session` or `device|trip-<firstT>`. */
export function sessionIdFor(group: GroupablePoint[]): string {
  const first = group[0]!
  return first.session !== null ? `${first.device}|${first.session}` : `${first.device}|trip-${first.t}`
}

/** Bounding box [minLon, minLat, maxLon, maxLat] over the given points. */
export function bboxOf(points: { lon: number; lat: number }[]): [number, number, number, number] {
  let minLon = Infinity
  let minLat = Infinity
  let maxLon = -Infinity
  let maxLat = -Infinity
  for (const { lon, lat } of points) {
    if (lon < minLon) minLon = lon
    if (lat < minLat) minLat = lat
    if (lon > maxLon) maxLon = lon
    if (lat > maxLat) maxLat = lat
  }
  return [minLon, minLat, maxLon, maxLat]
}

/** Closed polygon ring approximating a circle of radiusM around [lon, lat]. */
export function circlePolygon(
  lon: number,
  lat: number,
  radiusM: number,
  steps = 64,
): [number, number][] {
  const latRad = (lat * Math.PI) / 180
  const metersPerDegLat = 111_320
  const metersPerDegLon = 111_320 * Math.cos(latRad)

  const ring: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const angle = (2 * Math.PI * i) / steps
    const dLon = (radiusM * Math.cos(angle)) / metersPerDegLon
    const dLat = (radiusM * Math.sin(angle)) / metersPerDegLat
    ring.push([lon + dLon, lat + dLat])
  }
  return ring
}

interface SummarizablePoint extends GroupablePoint {
  lat: number
  lon: number
  bat: number | null
}

/** Derives a SessionSummary from an ascending-by-t, single-session group of points. */
export function summarize(group: SummarizablePoint[]): SessionSummary {
  const first = group[0]!
  const last = group[group.length - 1]!
  const speeds = deriveSpeeds(group)
  const maxSpeedMps = speeds.reduce<number | null>((max, speed) => {
    if (speed === null) return max
    if (max === null) return speed
    return Math.max(max, speed)
  }, null)

  return {
    id: sessionIdFor(group),
    device: first.device,
    session: first.session,
    start: first.t,
    end: last.t,
    points: group.length,
    distanceM: pathDistanceM(group),
    durationS: (new Date(last.t).getTime() - new Date(first.t).getTime()) / 1000,
    maxSpeedMps,
    batteryStart: first.bat,
    batteryEnd: last.bat,
    bbox: bboxOf(group),
  }
}
