import { describe, expect, it } from 'vitest'
import { toSessionSummary } from '../lib/server/routes.js'

const JAFFA_PORT: [number, number] = [34.7519, 32.0524]
const NEAR_JAFFA: [number, number] = [34.7521, 32.0526]
// ~1 degree of latitude away — a jump implying far more than MAX_PLAUSIBLE_MPS over a ~60s estimated dt.
const GPS_SPIKE: [number, number] = [34.7519, 33.0524]

const BASE_ROW = {
  device: 'TestPhone',
  session: '2026092618',
  start: new Date('2026-09-26T18:00:00.000Z'),
  end: new Date('2026-09-26T18:02:00.000Z'),
  points: 3,
  last_battery: 88,
  route: { type: 'LineString', coordinates: [JAFFA_PORT, NEAR_JAFFA, [34.7523, 32.0528]] },
}

describe('toSessionSummary', () => {
  it('maps a normal row', () => {
    const summary = toSessionSummary(BASE_ROW)
    expect(summary).not.toBeNull()
    expect(summary!.id).toBe('TestPhone|2026092618')
    expect(summary!.device).toBe('TestPhone')
    expect(summary!.session).toBe('2026092618')
    expect(summary!.start).toBe('2026-09-26T18:00:00.000Z')
    expect(summary!.end).toBe('2026-09-26T18:02:00.000Z')
    expect(summary!.points).toBe(3)
    expect(summary!.durationS).toBe(120)
    expect(summary!.distanceM).toBeGreaterThan(0)
    expect(summary!.batteryStart).toBeNull()
    expect(summary!.batteryEnd).toBe(88)
    expect(summary!.maxSpeedMps).toBeNull()
    expect(summary!.bbox).toHaveLength(4)
  })

  it('handles a 1-point route', () => {
    const row = { ...BASE_ROW, points: 1, end: BASE_ROW.start, route: { type: 'LineString', coordinates: [JAFFA_PORT] } }
    const summary = toSessionSummary(row)
    expect(summary).not.toBeNull()
    expect(summary!.points).toBe(1)
    expect(summary!.durationS).toBe(0)
    expect(summary!.distanceM).toBe(0)
    expect(summary!.bbox).toEqual([JAFFA_PORT[0], JAFFA_PORT[1], JAFFA_PORT[0], JAFFA_PORT[1]])
  })

  it('skips GPS-spike segments implied by the estimated dt', () => {
    // 3 points over 120s => estDt = 60s/segment. A ~111 km jump in 60s implies a speed
    // far above MAX_PLAUSIBLE_MPS, so both adjoining segments should be skipped.
    const row = {
      ...BASE_ROW,
      points: 3,
      route: { type: 'LineString', coordinates: [JAFFA_PORT, GPS_SPIKE, NEAR_JAFFA] },
    }
    const summary = toSessionSummary(row)
    expect(summary).not.toBeNull()
    expect(summary!.distanceM).toBe(0)
  })

  it('drops rows with missing device or session', () => {
    const { device, ...rest } = BASE_ROW
    expect(toSessionSummary(rest)).toBeNull()
    expect(toSessionSummary({ ...BASE_ROW, session: null })).toBeNull()
  })

  it('handles missing/invalid coordinates defensively, with a null bbox', () => {
    const summary = toSessionSummary({ ...BASE_ROW, route: { type: 'LineString', coordinates: null } })
    expect(summary).not.toBeNull()
    expect(summary!.distanceM).toBe(0)
    expect(summary!.bbox).toBeNull()
  })

  it('filters out malformed coordinate entries', () => {
    const summary = toSessionSummary({
      ...BASE_ROW,
      route: { type: 'LineString', coordinates: [JAFFA_PORT, ['bad', 'data'], NEAR_JAFFA] },
    })
    expect(summary).not.toBeNull()
    expect(summary!.distanceM).toBeGreaterThanOrEqual(0)
  })

  it('treats a null last_battery as null', () => {
    const summary = toSessionSummary({ ...BASE_ROW, last_battery: null })
    expect(summary!.batteryEnd).toBeNull()
  })
})
