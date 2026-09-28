import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Collection, Document } from 'mongodb'

const TOKEN = 'b'.repeat(64)
const DEVICE = 'Demo iPhone'

const modesStore = new Map<string, Document>()
const locationsStore = new Map<string, Document>()

function fakeModesCollection(): Collection<Document> {
  return {
    findOne: vi.fn(async (filter: Document) => modesStore.get(filter._id as string) ?? null),
  } as unknown as Collection<Document>
}

function fakeLocationsCollection(): Collection<Document> {
  return {
    updateOne: vi.fn(async (filter: Document, update: Document) => {
      const id = (filter.point_id as string) ?? JSON.stringify(filter)
      const existing = locationsStore.get(id) ?? {}
      const merged = { ...existing, ...(update as { $set: Document }).$set }
      locationsStore.set(id, merged)
      return { upsertedCount: existing === undefined ? 1 : 0 }
    }),
    find: () => ({
      projection: () => ({ toArray: async () => [] }),
      toArray: async () => [],
    }),
  } as unknown as Collection<Document>
}

vi.mock('../lib/server/mongo.js', () => ({
  getModesCollection: () => fakeModesCollection(),
  getCollection: () => fakeLocationsCollection(),
}))

beforeAll(() => {
  process.env.MONGODB_URI = 'mongodb://example/test'
  process.env.TRACKER_PASSWORD = 'correct-horse-battery-staple'
  process.env.SESSION_SECRET = 'a'.repeat(32)
  process.env.ANTITHEFT_TOKEN = TOKEN
})

function trackBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ts: new Date().toISOString(),
    lat: 32.0524,
    lon: 34.7519,
    device: DEVICE,
    ...overrides,
  }
}

async function postTrack(
  body: unknown,
  headers: Record<string, string>,
  ip: string,
  contentType = 'application/json',
): Promise<Response> {
  const { POST } = await import('../api/track.js')
  const payload = contentType === 'application/json' ? JSON.stringify(body) : new URLSearchParams(body as Record<string, string>).toString()
  const request = new Request('http://localhost/api/track', {
    method: 'POST',
    headers: { 'content-type': contentType, 'x-forwarded-for': ip, ...headers },
    body: payload,
  })
  return POST(request)
}

describe('POST /api/track', () => {
  it('401s without a token', async () => {
    const res = await postTrack(trackBody(), {}, `ip-${Math.random()}`)
    expect(res.status).toBe(401)
  })

  it('400s on a bad body', async () => {
    const res = await postTrack({ device: DEVICE }, { 'x-antitheft-token': TOKEN }, `ip-${Math.random()}`)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; errors: string[] }
    expect(body.error).toBeTruthy()
    expect(Array.isArray(body.errors)).toBe(true)
  })

  it('409s when there is no mode doc for the device', async () => {
    const res = await postTrack(
      trackBody({ device: `NoModeDevice-${Math.random()}` }),
      { 'x-antitheft-token': TOKEN },
      `ip-${Math.random()}`,
    )
    expect(res.status).toBe(409)
    const body = (await res.json()) as { status: string }
    expect(body.status).toBe('disarmed')
  })

  it('409s when disarmed', async () => {
    const device = `Disarmed-${Math.random()}`
    modesStore.set(device, { device, mode: 'disarmed' })
    const res = await postTrack(trackBody({ device }), { 'x-antitheft-token': TOKEN }, `ip-${Math.random()}`)
    expect(res.status).toBe(409)
  })

  it('201s when armed, with the doc shape matching the contract', async () => {
    const device = `Armed-${Math.random()}`
    modesStore.set(device, { device, mode: 'armed' })
    const ts = new Date().toISOString()
    const res = await postTrack(
      trackBody({ device, ts, accuracy_m: 10, battery: 80 }),
      { 'x-antitheft-token': TOKEN },
      `ip-${Math.random()}`,
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as { status: string; point_id: string }
    expect(body.status).toBe('stored')
    expect(body.point_id).toBe(`${device}|${ts}`)

    const stored = locationsStore.get(body.point_id)!
    expect(stored.device).toBe(device)
    expect(stored.ts).toBeInstanceOf(Date)
    expect(stored.loc).toEqual({ type: 'Point', coordinates: [34.7519, 32.0524] })
  })

  it('works with a form-urlencoded body', async () => {
    const device = `FormArmed-${Math.random()}`
    modesStore.set(device, { device, mode: 'armed' })
    const res = await postTrack(
      trackBody({ device }),
      { 'x-antitheft-token': TOKEN },
      `ip-${Math.random()}`,
      'application/x-www-form-urlencoded',
    )
    expect(res.status).toBe(201)
  })
})
