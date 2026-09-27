import type { TrackPoint } from './types.js'

export function interpolate(points: TrackPoint[], ms: number): [number, number] | null {
  if (points.length === 0) return null
  if (points.length === 1) return [points[0]!.lon, points[0]!.lat]

  if (ms <= new Date(points[0]!.t).getTime()) return [points[0]!.lon, points[0]!.lat]
  const lastIdx = points.length - 1
  if (ms >= new Date(points[lastIdx]!.t).getTime()) {
    const last = points[lastIdx]!
    return [last.lon, last.lat]
  }

  for (let i = 0; i < lastIdx; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    const aMs = new Date(a.t).getTime()
    const bMs = new Date(b.t).getTime()
    if (ms >= aMs && ms <= bMs) {
      const ratio = bMs === aMs ? 0 : (ms - aMs) / (bMs - aMs)
      return [a.lon + (b.lon - a.lon) * ratio, a.lat + (b.lat - a.lat) * ratio]
    }
  }
  return [points[lastIdx]!.lon, points[lastIdx]!.lat]
}

/** Points strictly before the cursor time. */
export function playedSubset(points: TrackPoint[], ms: number): TrackPoint[] {
  let end = 0
  while (end < points.length && new Date(points[end]!.t).getTime() <= ms) end++
  return points.slice(0, end)
}

/** Clamps a cursor time into the [minMs, maxMs] range of the current points. */
export function clampCursor(ms: number, minMs: number, maxMs: number): number {
  return Math.min(maxMs, Math.max(minMs, ms))
}
