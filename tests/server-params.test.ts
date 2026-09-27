import { describe, expect, it } from 'vitest'
import { parseDevice, parseRange, parseSession } from '../lib/server/params.js'

const DAY_MS = 24 * 60 * 60 * 1000

describe('parseRange', () => {
  it('defaults to [now - defaultSpanMs, now] when from/to are absent', () => {
    const url = new URL('http://x/api/points')
    const result = parseRange(url, { defaultSpanMs: DAY_MS, maxSpanMs: 31 * DAY_MS })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.to.getTime() - result.from.getTime()).toBeCloseTo(DAY_MS, -2)
  })

  it('accepts an explicit valid range', () => {
    const url = new URL('http://x/api/points?from=2026-01-01T00:00:00.000Z&to=2026-01-02T00:00:00.000Z')
    const result = parseRange(url, { defaultSpanMs: DAY_MS, maxSpanMs: 31 * DAY_MS })
    expect(result.ok).toBe(true)
  })

  it('rejects invalid "from"', () => {
    const url = new URL('http://x/api/points?from=not-a-date&to=2026-01-02T00:00:00.000Z')
    const result = parseRange(url, { defaultSpanMs: DAY_MS, maxSpanMs: 31 * DAY_MS })
    expect(result.ok).toBe(false)
  })

  it('rejects invalid "to"', () => {
    const url = new URL('http://x/api/points?from=2026-01-01T00:00:00.000Z&to=nope')
    const result = parseRange(url, { defaultSpanMs: DAY_MS, maxSpanMs: 31 * DAY_MS })
    expect(result.ok).toBe(false)
  })

  it('rejects when from is not before to', () => {
    const url = new URL('http://x/api/points?from=2026-01-02T00:00:00.000Z&to=2026-01-01T00:00:00.000Z')
    const result = parseRange(url, { defaultSpanMs: DAY_MS, maxSpanMs: 31 * DAY_MS })
    expect(result.ok).toBe(false)
  })

  it('rejects a span exceeding maxSpanMs', () => {
    const url = new URL('http://x/api/points?from=2026-01-01T00:00:00.000Z&to=2026-03-01T00:00:00.000Z')
    const result = parseRange(url, { defaultSpanMs: DAY_MS, maxSpanMs: 31 * DAY_MS })
    expect(result.ok).toBe(false)
  })

  it('rejects dates before 2020', () => {
    const url = new URL('http://x/api/points?from=2010-01-01T00:00:00.000Z&to=2026-01-01T00:00:00.000Z')
    const result = parseRange(url, { defaultSpanMs: DAY_MS, maxSpanMs: 400 * DAY_MS })
    expect(result.ok).toBe(false)
  })

  it('rejects "to" far in the future', () => {
    const farFuture = new Date(Date.now() + 10 * DAY_MS).toISOString()
    const url = new URL(`http://x/api/points?from=2026-01-01T00:00:00.000Z&to=${farFuture}`)
    const result = parseRange(url, { defaultSpanMs: DAY_MS, maxSpanMs: 400 * DAY_MS })
    expect(result.ok).toBe(false)
  })
})

describe('parseDevice', () => {
  it('returns null when absent', () => {
    const result = parseDevice(new URL('http://x/api/points'))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBeNull()
  })

  it('accepts a normal device name', () => {
    const result = parseDevice(new URL('http://x/api/points?device=TestPhone'))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe('TestPhone')
  })

  it('rejects device names over 64 chars', () => {
    const result = parseDevice(new URL(`http://x/api/points?device=${'a'.repeat(65)}`))
    expect(result.ok).toBe(false)
  })

  it('rejects control characters (injection-like payloads)', () => {
    const result = parseDevice(new URL('http://x/api/points?device=abc%00def'))
    expect(result.ok).toBe(false)
  })

  it('treats a NoSQL-operator-shaped string as an opaque literal, not an object', () => {
    const url = new URL('http://x/api/points')
    url.searchParams.set('device', '{"$gt":""}')
    const result = parseDevice(url)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe('{"$gt":""}')
  })
})

describe('parseSession', () => {
  it('returns null when absent', () => {
    const result = parseSession(new URL('http://x/api/points'))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBeNull()
  })

  it('accepts a valid session id', () => {
    const result = parseSession(new URL('http://x/api/points?session=2026092618'))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe('2026092618')
  })

  it('rejects session ids with disallowed characters', () => {
    const result = parseSession(new URL('http://x/api/points?session=abc;drop'))
    expect(result.ok).toBe(false)
  })

  it('rejects an injection-like operator payload', () => {
    const url = new URL('http://x/api/points')
    url.searchParams.set('session', '{"$ne":null}')
    const result = parseSession(url)
    expect(result.ok).toBe(false)
  })
})
