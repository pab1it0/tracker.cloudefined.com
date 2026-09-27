import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Collection, Document } from 'mongodb'
import { COOKIE_NAME, signSession } from '../lib/server/auth.js'

const store = new Map<string, Document>([
  ['TestPhone', { device: 'TestPhone', mode: 'armed', changed_at: null, last_checked_at: null }],
])

function fakeModesCollection(): Collection<Document> {
  return {
    find: () => ({
      sort: () => ({
        limit: () => ({
          toArray: async () => [...store.values()],
        }),
      }),
    }),
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

vi.mock('../lib/server/mongo.js', () => ({
  getModesCollection: () => fakeModesCollection(),
}))

const SECRET = 'a'.repeat(32)

beforeAll(() => {
  process.env.MONGODB_URI = 'mongodb://example/test'
  process.env.TRACKER_PASSWORD = 'correct-horse-battery-staple'
  process.env.SESSION_SECRET = SECRET
})

function sessionCookieHeader(): string {
  const value = signSession(SECRET, Date.now())
  return `${COOKIE_NAME}=${value}`
}

describe('GET /api/modes', () => {
  it('401s without a session cookie', async () => {
    const { GET } = await import('../api/modes.js')
    const res = await GET(new Request('http://localhost/api/modes'))
    expect(res.status).toBe(401)
  })

  it('200s with the sorted devices list', async () => {
    const { GET } = await import('../api/modes.js')
    const res = await GET(
      new Request('http://localhost/api/modes', { headers: { cookie: sessionCookieHeader() } }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { devices: { device: string }[] }
    expect(body.devices.map((d) => d.device)).toEqual(['TestPhone'])
  })
})

describe('POST /api/modes', () => {
  it('401s without a session cookie', async () => {
    const { POST } = await import('../api/modes.js')
    const request = new Request('http://localhost/api/modes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device: 'TestPhone', mode: 'armed' }),
    })
    const res = await POST(request)
    expect(res.status).toBe(401)
  })

  it('400s on a bad mode value', async () => {
    const { POST } = await import('../api/modes.js')
    const request = new Request('http://localhost/api/modes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: sessionCookieHeader() },
      body: JSON.stringify({ device: 'TestPhone', mode: 'sleeping' }),
    })
    const res = await POST(request)
    expect(res.status).toBe(400)
  })

  it('404s for an unknown device', async () => {
    const { POST } = await import('../api/modes.js')
    const request = new Request('http://localhost/api/modes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: sessionCookieHeader() },
      body: JSON.stringify({ device: 'NoSuchPhone', mode: 'armed' }),
    })
    const res = await POST(request)
    expect(res.status).toBe(404)
  })

  it('200s and returns the updated DeviceMode', async () => {
    const { POST } = await import('../api/modes.js')
    const request = new Request('http://localhost/api/modes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: sessionCookieHeader() },
      body: JSON.stringify({ device: 'TestPhone', mode: 'disarmed' }),
    })
    const res = await POST(request)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { device: string; mode: string }
    expect(body.device).toBe('TestPhone')
    expect(body.mode).toBe('disarmed')
  })
})
