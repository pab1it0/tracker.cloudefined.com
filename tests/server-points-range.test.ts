import { describe, expect, it } from 'vitest'
import type { Collection, Document } from 'mongodb'
import { pointsInRange } from '../lib/server/points.js'

function docFor(minute: number) {
  return {
    device: 'TestPhone',
    session: '2026092618',
    ts: new Date(2026, 8, 26, 18, minute),
    loc: { type: 'Point', coordinates: [34.7519, 32.0524] },
    accuracy_m: 10,
    altitude_m: null,
    speed_mps: null,
    battery: 90,
  }
}

/** Fake collection: sort/limit are applied in-memory over `all`, like a real find(). */
function fakeCollection(all: ReturnType<typeof docFor>[]): Collection<Document> {
  return {
    find: () => ({
      sort: (spec: Record<string, 1 | -1>) => ({
        limit: (n: number) => ({
          toArray: async () => {
            const dir = spec.ts === -1 ? -1 : 1
            const sorted = [...all].sort((a, b) => dir * (a.ts.getTime() - b.ts.getTime()))
            return sorted.slice(0, n)
          },
        }),
      }),
    }),
  } as unknown as Collection<Document>
}

describe('pointsInRange', () => {
  it('keeps the newest points, in ascending order, when truncated', async () => {
    const docs = Array.from({ length: 5 }, (_, i) => docFor(i))
    const col = fakeCollection(docs)

    const { points, truncated } = await pointsInRange(
      col,
      { from: new Date(2026, 8, 26, 18, 0), to: new Date(2026, 8, 26, 18, 4) },
      3,
    )

    expect(truncated).toBe(true)
    expect(points).toHaveLength(3)
    expect(points.map((p) => p.t)).toEqual([
      new Date(2026, 8, 26, 18, 2).toISOString(),
      new Date(2026, 8, 26, 18, 3).toISOString(),
      new Date(2026, 8, 26, 18, 4).toISOString(),
    ])
  })

  it('returns all points in ascending order when not truncated', async () => {
    const docs = Array.from({ length: 3 }, (_, i) => docFor(i))
    const col = fakeCollection(docs)

    const { points, truncated } = await pointsInRange(
      col,
      { from: new Date(2026, 8, 26, 18, 0), to: new Date(2026, 8, 26, 18, 2) },
      10,
    )

    expect(truncated).toBe(false)
    expect(points.map((p) => p.t)).toEqual([
      new Date(2026, 8, 26, 18, 0).toISOString(),
      new Date(2026, 8, 26, 18, 1).toISOString(),
      new Date(2026, 8, 26, 18, 2).toISOString(),
    ])
  })
})
