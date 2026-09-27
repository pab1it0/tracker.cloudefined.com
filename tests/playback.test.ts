import { describe, expect, it } from 'vitest'
import { clampCursor, interpolate, playedSubset } from '../lib/shared/playback.js'
import type { TrackPoint } from '../lib/shared/types.js'

function point(t: string, lon: number, lat: number): TrackPoint {
  return { t, lat, lon, acc: null, alt: null, spd: null, bat: null, session: null, device: 'dev-1' }
}

const POINTS: TrackPoint[] = [
  point('2024-01-01T00:00:00.000Z', 34.7, 32.0),
  point('2024-01-01T00:01:00.000Z', 34.8, 32.1),
  point('2024-01-01T00:02:00.000Z', 34.9, 32.2),
]

describe('clampCursor', () => {
  it('clamps below the minimum', () => {
    expect(clampCursor(-100, 10, 100)).toBe(10)
  })

  it('clamps above the maximum', () => {
    expect(clampCursor(1000, 10, 100)).toBe(100)
  })

  it('passes through values already in range', () => {
    expect(clampCursor(50, 10, 100)).toBe(50)
  })

  it('handles a zero-width range (empty points)', () => {
    expect(clampCursor(-178336912.13, 0, 0)).toBe(0)
  })
})

describe('interpolate', () => {
  it('returns null for no points', () => {
    expect(interpolate([], 0)).toBeNull()
  })

  it('returns the single point when there is only one', () => {
    expect(interpolate([POINTS[0]!], 12345)).toEqual([34.7, 32.0])
  })

  it('clamps to the first point before the range', () => {
    const ms = new Date(POINTS[0]!.t).getTime() - 5000
    expect(interpolate(POINTS, ms)).toEqual([34.7, 32.0])
  })

  it('clamps to the last point after the range', () => {
    const ms = new Date(POINTS[2]!.t).getTime() + 5000
    expect(interpolate(POINTS, ms)).toEqual([34.9, 32.2])
  })

  it('interpolates linearly between two points', () => {
    const aMs = new Date(POINTS[0]!.t).getTime()
    const bMs = new Date(POINTS[1]!.t).getTime()
    const mid = aMs + (bMs - aMs) / 2
    const [lon, lat] = interpolate(POINTS, mid)!
    expect(lon).toBeCloseTo(34.75, 5)
    expect(lat).toBeCloseTo(32.05, 5)
  })
})

describe('playedSubset', () => {
  it('returns an empty array before the first point', () => {
    const ms = new Date(POINTS[0]!.t).getTime() - 1000
    expect(playedSubset(POINTS, ms)).toEqual([])
  })

  it('returns all points at or before the cursor', () => {
    const ms = new Date(POINTS[1]!.t).getTime()
    expect(playedSubset(POINTS, ms)).toEqual([POINTS[0], POINTS[1]])
  })

  it('returns every point when the cursor is past the end', () => {
    const ms = new Date(POINTS[2]!.t).getTime() + 5000
    expect(playedSubset(POINTS, ms)).toEqual(POINTS)
  })
})
