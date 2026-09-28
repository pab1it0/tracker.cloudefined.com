import { describe, expect, it } from 'vitest'
import { parseAlert, parsePoint } from '../lib/server/ingest.js'

const NOW = new Date('2026-09-26T18:00:00.000Z')

describe('parsePoint', () => {
  it('accepts a comma decimal separator for lat/lon', () => {
    const result = parsePoint({ ts: NOW.toISOString(), lat: '32,05', lon: '34,75' }, NOW)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.lat).toBeCloseTo(32.05)
      expect(result.value.lon).toBeCloseTo(34.75)
    }
  })

  it('rejects a ts more than 15 minutes from server time', () => {
    const skewed = new Date(NOW.getTime() + 16 * 60 * 1000).toISOString()
    const result = parsePoint({ ts: skewed, lat: '32', lon: '34' }, NOW)
    expect(result.ok).toBe(false)
  })

  it('accepts a ts within 15 minutes of server time', () => {
    const skewed = new Date(NOW.getTime() + 14 * 60 * 1000).toISOString()
    const result = parsePoint({ ts: skewed, lat: '32', lon: '34' }, NOW)
    expect(result.ok).toBe(true)
  })

  it('rejects lat and lon both 0', () => {
    const result = parsePoint({ ts: NOW.toISOString(), lat: '0', lon: '0' }, NOW)
    expect(result.ok).toBe(false)
  })

  it('rejects an invalid session', () => {
    const result = parsePoint({ ts: NOW.toISOString(), lat: '32', lon: '34', session: 'bad session!' }, NOW)
    expect(result.ok).toBe(false)
  })

  it('accepts a valid session', () => {
    const result = parsePoint({ ts: NOW.toISOString(), lat: '32', lon: '34', session: 'abc-123' }, NOW)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.session).toBe('abc-123')
  })

  it('defaults device to "iPhone" when missing', () => {
    const result = parsePoint({ ts: NOW.toISOString(), lat: '32', lon: '34' }, NOW)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.device).toBe('iPhone')
  })

  it('rejects missing lat/lon', () => {
    const result = parsePoint({ ts: NOW.toISOString() }, NOW)
    expect(result.ok).toBe(false)
  })
})

describe('parseAlert', () => {
  it('accepts a comma decimal separator', () => {
    const result = parseAlert({ trigger: 'manual', timestamp: NOW.toISOString(), lat: '32,05', lon: '34,75' }, NOW)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.lat).toBeCloseTo(32.05)
      expect(result.value.lon).toBeCloseTo(34.75)
    }
  })

  it('rejects a timestamp more than 60 minutes from server time', () => {
    const skewed = new Date(NOW.getTime() + 61 * 60 * 1000).toISOString()
    const result = parseAlert({ trigger: 'manual', timestamp: skewed }, NOW)
    expect(result.ok).toBe(false)
  })

  it('accepts a timestamp within 60 minutes of server time', () => {
    const skewed = new Date(NOW.getTime() - 59 * 60 * 1000).toISOString()
    const result = parseAlert({ trigger: 'manual', timestamp: skewed }, NOW)
    expect(result.ok).toBe(true)
  })

  it('rejects a bad trigger', () => {
    const result = parseAlert({ trigger: 'nonsense', timestamp: NOW.toISOString() }, NOW)
    expect(result.ok).toBe(false)
  })

  it('defaults trigger to manual when missing', () => {
    const result = parseAlert({ timestamp: NOW.toISOString() }, NOW)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.trigger).toBe('manual')
  })

  it('defaults device to "iPhone" when missing', () => {
    const result = parseAlert({ trigger: 'manual', timestamp: NOW.toISOString() }, NOW)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.device).toBe('iPhone')
  })

  it('leaves lat/lon null when omitted', () => {
    const result = parseAlert({ trigger: 'manual', timestamp: NOW.toISOString() }, NOW)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.lat).toBeNull()
      expect(result.value.lon).toBeNull()
    }
  })
})
