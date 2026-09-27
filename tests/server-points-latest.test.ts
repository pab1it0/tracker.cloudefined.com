import { describe, expect, it } from 'vitest'
import type { Collection, Document } from 'mongodb'
import { latestPerDevice } from '../lib/server/points.js'

function doc(device: string, minute: number) {
  return {
    device,
    session: '2026092618',
    ts: new Date(2026, 8, 26, 18, minute),
    loc: { type: 'Point', coordinates: [34.7519, 32.0524] },
    accuracy_m: 10,
    altitude_m: null,
    speed_mps: null,
    battery: 90,
  }
}

/** Fake aggregate: applies $match, $group (first per device after per-device sort), $sort, $limit. */
function fakeCollection(all: ReturnType<typeof doc>[]): Collection<Document> {
  return {
    aggregate: () => ({
      toArray: async () => {
        const byDevice = new Map<string, ReturnType<typeof doc>>()
        for (const d of all) {
          const existing = byDevice.get(d.device)
          if (!existing || d.ts.getTime() > existing.ts.getTime()) byDevice.set(d.device, d)
        }
        const grouped = [...byDevice.values()].map((d) => ({ doc: d }))
        grouped.sort((a, b) => b.doc.ts.getTime() - a.doc.ts.getTime())
        return grouped
      },
    }),
  } as unknown as Collection<Document>
}

describe('latestPerDevice', () => {
  it('returns devices newest-first regardless of input order', async () => {
    const docs = [doc('B', 5), doc('A', 10), doc('C', 1)]
    const col = fakeCollection(docs)

    const points = await latestPerDevice(col)

    expect(points.map((p) => p.device)).toEqual(['A', 'B', 'C'])
  })
})
