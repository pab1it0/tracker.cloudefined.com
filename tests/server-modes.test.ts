import { describe, expect, it, vi } from 'vitest'
import type { Collection, Document } from 'mongodb'
import { checkIn, setMode, toDeviceMode } from '../lib/server/modes.js'

describe('toDeviceMode', () => {
  it('fails closed on an unknown mode value', () => {
    const result = toDeviceMode({ device: 'TestPhone', mode: 'ARMED', changed_at: null, last_checked_at: null })
    expect(result).not.toBeNull()
    expect(result!.mode).toBe('disarmed')
  })

  it('fails closed when mode is missing', () => {
    const result = toDeviceMode({ device: 'TestPhone', changed_at: null, last_checked_at: null })
    expect(result!.mode).toBe('disarmed')
  })

  it('returns null when device is not a string', () => {
    const result = toDeviceMode({ device: 123, mode: 'armed', changed_at: null, last_checked_at: null })
    expect(result).toBeNull()
  })

  it('maps null dates to null', () => {
    const result = toDeviceMode({ device: 'TestPhone', mode: 'armed', changed_at: null, last_checked_at: null })
    expect(result!.since).toBeNull()
    expect(result!.lastCheckedAt).toBeNull()
  })

  it('maps Date values to ISO strings', () => {
    const changedAt = new Date('2026-09-26T18:00:00.000Z')
    const result = toDeviceMode({ device: 'TestPhone', mode: 'armed', changed_at: changedAt, last_checked_at: null })
    expect(result!.since).toBe('2026-09-26T18:00:00.000Z')
  })
})

describe('checkIn', () => {
  it('calls findOneAndUpdate with the expected filter/update/options', async () => {
    const now = new Date('2026-09-26T18:00:00.000Z')
    const findOneAndUpdate = vi.fn(async () => ({
      device: 'TestPhone',
      mode: 'armed',
      changed_at: null,
      last_checked_at: now,
    }))
    const col = { findOneAndUpdate } as unknown as Collection<Document>

    const result = await checkIn(col, 'TestPhone', now)

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'TestPhone' },
      { $set: { last_checked_at: now }, $setOnInsert: { device: 'TestPhone', mode: 'disarmed', changed_at: null } },
      { upsert: true, returnDocument: 'after' },
    )
    expect(result.device).toBe('TestPhone')
    expect(result.lastCheckedAt).toBe(now.toISOString())
  })
})

// Minimal in-memory fake collection for setMode: enough surface for updateOne + findOne.
function fakeModesCollection(initial: Record<string, Document>): Collection<Document> {
  const store = new Map(Object.entries(initial))
  return {
    updateOne: vi.fn(async (filter: Document, update: Document) => {
      const id = filter._id as string
      const doc = store.get(id)
      if (!doc) return { matchedCount: 0 }
      if (filter.mode && '$ne' in (filter.mode as Document) && doc.mode === (filter.mode as Document).$ne) {
        return { matchedCount: 0 }
      }
      Object.assign(doc, (update as { $set: Document }).$set)
      return { matchedCount: 1 }
    }),
    findOne: vi.fn(async (filter: Document) => store.get(filter._id as string) ?? null),
  } as unknown as Collection<Document>
}

describe('setMode', () => {
  it('returns null for an unknown device', async () => {
    const col = fakeModesCollection({})
    const result = await setMode(col, 'Unknown', 'armed', new Date())
    expect(result).toBeNull()
  })

  it('does not move changed_at when the mode is unchanged', async () => {
    const changedAt = new Date('2026-09-26T18:00:00.000Z')
    const col = fakeModesCollection({
      TestPhone: { device: 'TestPhone', mode: 'armed', changed_at: changedAt, last_checked_at: null },
    })
    const result = await setMode(col, 'TestPhone', 'armed', new Date('2026-09-26T19:00:00.000Z'))
    expect(result!.since).toBe(changedAt.toISOString())
  })

  it('moves changed_at on an actual transition', async () => {
    const changedAt = new Date('2026-09-26T18:00:00.000Z')
    const now = new Date('2026-09-26T19:00:00.000Z')
    const col = fakeModesCollection({
      TestPhone: { device: 'TestPhone', mode: 'armed', changed_at: changedAt, last_checked_at: null },
    })
    const result = await setMode(col, 'TestPhone', 'disarmed', now)
    expect(result!.mode).toBe('disarmed')
    expect(result!.since).toBe(now.toISOString())
  })
})
