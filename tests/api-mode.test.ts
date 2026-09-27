import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Collection, Document } from 'mongodb'

const TOKEN = 'b'.repeat(64)

// In-memory fake for getModesCollection: enough surface for checkIn's findOneAndUpdate.
const store = new Map<string, Document>()
function fakeModesCollection(): Collection<Document> {
  return {
    findOneAndUpdate: vi.fn(async (filter: Document, update: Document) => {
      const id = filter._id as string
      let doc = store.get(id)
      if (!doc) {
        doc = { ...(update as { $setOnInsert: Document }).$setOnInsert }
        store.set(id, doc)
      }
      Object.assign(doc, (update as { $set: Document }).$set)
      return doc
    }),
  } as unknown as Collection<Document>
}

vi.mock('../lib/server/mongo.js', () => ({
  getModesCollection: () => fakeModesCollection(),
}))

beforeAll(() => {
  process.env.MONGODB_URI = 'mongodb://example/test'
  process.env.TRACKER_PASSWORD = 'correct-horse-battery-staple'
  process.env.SESSION_SECRET = 'a'.repeat(32)
  process.env.ANTITHEFT_TOKEN = TOKEN
})

async function postMode(body: unknown, headers: Record<string, string>, ip: string): Promise<Response> {
  const { POST } = await import('../api/mode.js')
  const request = new Request('http://localhost/api/mode', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...headers },
    body: JSON.stringify(body),
  })
  return POST(request)
}

describe('POST /api/mode', () => {
  it('400s when device is missing', async () => {
    const res = await postMode({}, { 'x-antitheft-token': TOKEN }, `ip-${Math.random()}`)
    expect(res.status).toBe(400)
  })

  it('400s on non-JSON content-type', async () => {
    const { POST } = await import('../api/mode.js')
    const request = new Request('http://localhost/api/mode', {
      method: 'POST',
      headers: { 'content-type': 'text/plain', 'x-forwarded-for': `ip-${Math.random()}` },
      body: 'not json',
    })
    const res = await POST(request)
    expect(res.status).toBe(400)
  })

  it('401s when the token header is missing', async () => {
    const res = await postMode({ device: 'TestPhone' }, {}, `ip-${Math.random()}`)
    expect(res.status).toBe(401)
  })

  it('401s when the token is wrong', async () => {
    const res = await postMode({ device: 'TestPhone' }, { 'x-antitheft-token': 'wrong-token' }, `ip-${Math.random()}`)
    expect(res.status).toBe(401)
  })

  it('429s after 5 wrong tokens from one IP', async () => {
    const ip = `ip-${Math.random()}`
    const responses: Response[] = []
    for (let i = 0; i < 6; i++) {
      responses.push(await postMode({ device: 'TestPhone' }, { 'x-antitheft-token': 'wrong-token' }, ip))
    }
    const statuses = responses.map((r) => r.status)
    expect(statuses.filter((s) => s === 401).length).toBeLessThanOrEqual(5)
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0)
  })

  it('200s with {device, mode, since} on a happy path', async () => {
    const res = await postMode({ device: 'TestPhone' }, { 'x-antitheft-token': TOKEN }, `ip-${Math.random()}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { device: string; mode: string; since: string | null }
    expect(body.device).toBe('TestPhone')
    expect(body.mode).toBe('disarmed')
    expect('since' in body).toBe(true)
  })

  it('500s with "server not configured" when ANTITHEFT_TOKEN is unset', async () => {
    const original = process.env.ANTITHEFT_TOKEN
    delete process.env.ANTITHEFT_TOKEN
    try {
      const res = await postMode({ device: 'TestPhone' }, { 'x-antitheft-token': TOKEN }, `ip-${Math.random()}`)
      expect(res.status).toBe(500)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('server not configured')
    } finally {
      process.env.ANTITHEFT_TOKEN = original
    }
  })
})
