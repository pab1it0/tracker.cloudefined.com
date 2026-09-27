import { describe, expect, it } from 'vitest'
import { toTrackPoint } from '../lib/server/points.js'

const BASE = {
  device: 'TestPhone',
  session: '2026092618',
  ts: new Date('2026-09-26T18:00:00.000Z'),
  loc: { type: 'Point', coordinates: [34.7519, 32.0524] },
  accuracy_m: 10,
  altitude_m: 5,
  speed_mps: null,
  battery: 90,
}

describe('toTrackPoint', () => {
  it('maps a well-formed document', () => {
    const point = toTrackPoint(BASE)
    expect(point).toEqual({
      t: '2026-09-26T18:00:00.000Z',
      lat: 32.0524,
      lon: 34.7519,
      acc: 10,
      alt: 5,
      spd: null,
      bat: 90,
      session: '2026092618',
      device: 'TestPhone',
    })
  })

  it('accepts ts as an ISO string', () => {
    const point = toTrackPoint({ ...BASE, ts: '2026-09-26T18:00:00.000Z' })
    expect(point?.t).toBe('2026-09-26T18:00:00.000Z')
  })

  it('handles null session', () => {
    const point = toTrackPoint({ ...BASE, session: null })
    expect(point?.session).toBeNull()
  })

  it('handles null numeric fields', () => {
    const point = toTrackPoint({ ...BASE, accuracy_m: null, altitude_m: null, battery: null })
    expect(point?.acc).toBeNull()
    expect(point?.alt).toBeNull()
    expect(point?.bat).toBeNull()
  })

  it('drops docs with invalid ts', () => {
    expect(toTrackPoint({ ...BASE, ts: 'not-a-date' })).toBeNull()
  })

  it('drops docs with missing loc', () => {
    const { loc, ...rest } = BASE
    expect(toTrackPoint(rest)).toBeNull()
  })

  it('drops docs with wrong loc type', () => {
    expect(toTrackPoint({ ...BASE, loc: { type: 'Polygon', coordinates: [] } })).toBeNull()
  })

  it('drops docs with non-numeric coordinates', () => {
    expect(
      toTrackPoint({ ...BASE, loc: { type: 'Point', coordinates: ['a', 'b'] } }),
    ).toBeNull()
  })

  it('drops docs with missing device', () => {
    const { device, ...rest } = BASE
    expect(toTrackPoint(rest)).toBeNull()
  })
})
