import { describe, expect, it } from 'vitest'
import {
  bboxOf,
  circlePolygon,
  deriveSpeeds,
  groupSessions,
  haversineM,
  MAX_PLAUSIBLE_MPS,
  MIN_DT_S,
  pathDistanceM,
  sessionIdFor,
  summarize,
} from '../lib/shared/geo.js'

// Central Tel Aviv / Jaffa synthetic coordinates only (per repo policy).
const JAFFA_PORT: [number, number] = [34.7519, 32.0524]
const ROTHSCHILD: [number, number] = [34.7745, 32.0644]

describe('haversineM', () => {
  it('computes ~111.2 km for 1 degree of latitude', () => {
    const a: [number, number] = [34.75, 32.0]
    const b: [number, number] = [34.75, 33.0]
    const distance = haversineM(a, b)
    expect(distance).toBeGreaterThan(111_000)
    expect(distance).toBeLessThan(111_400)
  })

  it('is zero for identical points', () => {
    expect(haversineM(JAFFA_PORT, JAFFA_PORT)).toBe(0)
  })

  it('is symmetric', () => {
    expect(haversineM(JAFFA_PORT, ROTHSCHILD)).toBeCloseTo(haversineM(ROTHSCHILD, JAFFA_PORT), 6)
  })
})

describe('deriveSpeeds', () => {
  it('is null at index 0', () => {
    const points = [
      { t: '2026-09-26T16:00:00.000Z', lat: 32.0524, lon: 34.7519 },
      { t: '2026-09-26T16:01:00.000Z', lat: 32.0525, lon: 34.752 },
    ]
    expect(deriveSpeeds(points)[0]).toBeNull()
  })

  it('returns null when dt is below MIN_DT_S', () => {
    const points = [
      { t: '2026-09-26T16:00:00.000Z', lat: 32.0524, lon: 34.7519 },
      { t: `2026-09-26T16:00:0${MIN_DT_S - 1}.000Z`, lat: 32.0526, lon: 34.7521 },
    ]
    expect(deriveSpeeds(points)[1]).toBeNull()
  })

  it('skips implausible GPS spikes', () => {
    const points = [
      { t: '2026-09-26T16:00:00.000Z', lat: 32.0524, lon: 34.7519 },
      // ~1 degree lat jump in 60s implies far more than MAX_PLAUSIBLE_MPS
      { t: '2026-09-26T16:01:00.000Z', lat: 33.0524, lon: 34.7519 },
      { t: '2026-09-26T16:02:00.000Z', lat: 32.0526, lon: 34.752 },
    ]
    const speeds = deriveSpeeds(points)
    expect(speeds[1]).toBeNull()
  })

  it('computes plausible walking speed and smooths with neighbors', () => {
    const points = [
      { t: '2026-09-26T16:00:00.000Z', lat: 32.0524, lon: 34.7519 },
      { t: '2026-09-26T16:01:00.000Z', lat: 32.05252, lon: 34.75192 },
      { t: '2026-09-26T16:02:00.000Z', lat: 32.05264, lon: 34.75204 },
    ]
    const speeds = deriveSpeeds(points)
    expect(speeds[0]).toBeNull()
    expect(speeds[1]).not.toBeNull()
    expect(speeds[1]!).toBeGreaterThan(0)
    expect(speeds[1]!).toBeLessThan(MAX_PLAUSIBLE_MPS)
  })
})

describe('pathDistanceM', () => {
  it('sums plausible segments and skips GPS jumps', () => {
    const points = [
      { t: '2026-09-26T16:00:00.000Z', lat: 32.0524, lon: 34.7519 },
      { t: '2026-09-26T16:01:00.000Z', lat: 32.05252, lon: 34.75192 },
      // implausible spike then back — the spike-in segment should be skipped
      { t: '2026-09-26T16:01:05.000Z', lat: 33.0524, lon: 34.7519 },
      { t: '2026-09-26T16:02:05.000Z', lat: 32.05264, lon: 34.75204 },
    ]
    const distance = pathDistanceM(points)
    expect(distance).toBeGreaterThan(0)
    expect(distance).toBeLessThan(1000)
  })

  it('is zero for a single point', () => {
    expect(pathDistanceM([{ t: '2026-09-26T16:00:00.000Z', lat: 32.0524, lon: 34.7519 }])).toBe(0)
  })
})

describe('groupSessions', () => {
  it('groups by device+session, ignoring input order', () => {
    const points = [
      { t: '2026-09-26T18:02:00.000Z', device: 'TestPhone', session: '2026092618' },
      { t: '2026-09-26T18:00:00.000Z', device: 'TestPhone', session: '2026092618' },
      { t: '2026-09-26T19:00:00.000Z', device: 'TestPhone', session: '2026092619' },
    ]
    const groups = groupSessions(points)
    expect(groups).toHaveLength(2)
    expect(groups[0]!.map((p) => p.t)).toEqual([
      '2026-09-26T18:00:00.000Z',
      '2026-09-26T18:02:00.000Z',
    ])
    expect(groups[1]!.map((p) => p.t)).toEqual(['2026-09-26T19:00:00.000Z'])
  })

  it('splits null-session points per device on gaps > gapMs', () => {
    const points = [
      { t: '2026-09-26T10:00:00.000Z', device: 'TestPhone', session: null },
      { t: '2026-09-26T10:05:00.000Z', device: 'TestPhone', session: null },
      // 20 min gap > default 15 min
      { t: '2026-09-26T10:25:00.000Z', device: 'TestPhone', session: null },
    ]
    const groups = groupSessions(points)
    expect(groups).toHaveLength(2)
    expect(groups[0]!).toHaveLength(2)
    expect(groups[1]!).toHaveLength(1)
  })

  it('keeps null-session groups separate per device', () => {
    const points = [
      { t: '2026-09-26T10:00:00.000Z', device: 'TestPhone', session: null },
      { t: '2026-09-26T10:01:00.000Z', device: 'other', session: null },
    ]
    const groups = groupSessions(points)
    expect(groups).toHaveLength(2)
  })

  it('respects a custom gapMs', () => {
    const points = [
      { t: '2026-09-26T10:00:00.000Z', device: 'TestPhone', session: null },
      { t: '2026-09-26T10:02:00.000Z', device: 'TestPhone', session: null },
    ]
    const groups = groupSessions(points, 60_000)
    expect(groups).toHaveLength(2)
  })

  it('returns groups in ascending start order', () => {
    const points = [
      { t: '2026-09-26T19:00:00.000Z', device: 'TestPhone', session: '2026092619' },
      { t: '2026-09-26T18:00:00.000Z', device: 'TestPhone', session: '2026092618' },
    ]
    const groups = groupSessions(points)
    expect(groups[0]![0]!.t).toBe('2026-09-26T18:00:00.000Z')
    expect(groups[1]![0]!.t).toBe('2026-09-26T19:00:00.000Z')
  })
})

describe('sessionIdFor', () => {
  it('uses device|session when session is present', () => {
    const group = [{ t: '2026-09-26T18:00:00.000Z', device: 'TestPhone', session: '2026092618' }]
    expect(sessionIdFor(group)).toBe('TestPhone|2026092618')
  })

  it('uses device|trip-<firstT> when session is null', () => {
    const group = [{ t: '2026-09-26T18:00:00.000Z', device: 'TestPhone', session: null }]
    expect(sessionIdFor(group)).toBe('TestPhone|trip-2026-09-26T18:00:00.000Z')
  })
})

describe('bboxOf', () => {
  it('computes the min/max envelope', () => {
    const bbox = bboxOf([
      { lon: 34.7519, lat: 32.0524 },
      { lon: 34.7745, lat: 32.0644 },
    ])
    expect(bbox).toEqual([34.7519, 32.0524, 34.7745, 32.0644])
  })
})

describe('circlePolygon', () => {
  it('returns a closed ring with steps + 1 points', () => {
    const ring = circlePolygon(34.7519, 32.0524, 50, 16)
    expect(ring).toHaveLength(17)
    expect(ring[0]).toEqual(ring[16])
  })

  it('defaults to 64 steps', () => {
    const ring = circlePolygon(34.7519, 32.0524, 50)
    expect(ring).toHaveLength(65)
  })
})

describe('summarize', () => {
  it('derives all summary fields from a session group', () => {
    const group = [
      {
        t: '2026-09-26T18:00:00.000Z',
        device: 'TestPhone',
        session: '2026092618',
        lat: 32.0524,
        lon: 34.7519,
        bat: 90,
      },
      {
        t: '2026-09-26T18:01:00.000Z',
        device: 'TestPhone',
        session: '2026092618',
        lat: 32.05252,
        lon: 34.75192,
        bat: 89,
      },
      {
        t: '2026-09-26T18:02:00.000Z',
        device: 'TestPhone',
        session: '2026092618',
        lat: 32.05264,
        lon: 34.75204,
        bat: 88,
      },
    ]
    const summary = summarize(group)
    expect(summary.id).toBe('TestPhone|2026092618')
    expect(summary.device).toBe('TestPhone')
    expect(summary.session).toBe('2026092618')
    expect(summary.start).toBe('2026-09-26T18:00:00.000Z')
    expect(summary.end).toBe('2026-09-26T18:02:00.000Z')
    expect(summary.points).toBe(3)
    expect(summary.durationS).toBe(120)
    expect(summary.distanceM).toBeGreaterThan(0)
    expect(summary.batteryStart).toBe(90)
    expect(summary.batteryEnd).toBe(88)
    expect(summary.bbox).toHaveLength(4)
  })
})
