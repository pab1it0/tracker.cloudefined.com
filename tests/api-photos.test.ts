import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Collection, Document } from 'mongodb'
import { Binary } from 'mongodb'
import { COOKIE_NAME, signSession } from '../lib/server/auth.js'

const NOW = new Date()
const PHOTO_ID = `Demo iPhone|${NOW.toISOString()}|front`

const photosStore = new Map<string, Document>([
  [
    PHOTO_ID,
    {
      _id: PHOTO_ID,
      device: 'Demo iPhone',
      camera: 'front',
      trigger: 'manual',
      ts: NOW,
      loc: { type: 'Point', coordinates: [34.7519, 32.0524] },
      width: 100,
      height: 100,
      bytes: new Binary(Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3])),
      thumb: new Binary(Buffer.from([0xff, 0xd8, 0xff, 9, 9, 9])),
    },
  ],
])

function fakePhotosCollection(): Collection<Document> {
  return {
    find: () => ({
      sort: () => ({
        limit: () => ({
          toArray: async () => [...photosStore.values()],
        }),
      }),
    }),
    findOne: vi.fn(async (filter: Document) => photosStore.get(filter._id as string) ?? null),
  } as unknown as Collection<Document>
}

vi.mock('../lib/server/mongo.js', () => ({
  getPhotosCollection: () => fakePhotosCollection(),
}))

const SECRET = 'a'.repeat(32)

beforeAll(() => {
  process.env.MONGODB_URI = 'mongodb://example/test'
  process.env.TRACKER_PASSWORD = 'correct-horse-battery-staple'
  process.env.SESSION_SECRET = SECRET
})

function sessionCookieHeader(): string {
  return `${COOKIE_NAME}=${signSession(SECRET, Date.now())}`
}

describe('GET /api/photos', () => {
  it('401s without a session cookie', async () => {
    const { GET } = await import('../api/photos.js')
    const res = await GET(new Request('http://localhost/api/photos'))
    expect(res.status).toBe(401)
  })

  it('200s with the photo list, excluding bytes/thumb', async () => {
    const { GET } = await import('../api/photos.js')
    const res = await GET(
      new Request('http://localhost/api/photos', { headers: { cookie: sessionCookieHeader() } }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { photos: Record<string, unknown>[]; truncated: boolean }
    expect(body.photos).toHaveLength(1)
    const photo = body.photos[0]!
    expect(photo.id).toBe(PHOTO_ID)
    expect(photo.device).toBe('Demo iPhone')
    expect('bytes' in photo).toBe(false)
    expect('thumb' in photo).toBe(false)
  })
})

describe('GET /api/photo', () => {
  it('400s on a bad id', async () => {
    const { GET } = await import('../api/photo.js')
    const res = await GET(
      new Request('http://localhost/api/photo?id=bad', { headers: { cookie: sessionCookieHeader() } }),
    )
    expect(res.status).toBe(400)
  })

  it('404s for a missing photo', async () => {
    const { GET } = await import('../api/photo.js')
    const missingId = `Demo iPhone|${new Date(NOW.getTime() + 60_000).toISOString()}|back`
    const res = await GET(
      new Request(`http://localhost/api/photo?id=${encodeURIComponent(missingId)}`, {
        headers: { cookie: sessionCookieHeader() },
      }),
    )
    expect(res.status).toBe(404)
  })

  it('200s with image/jpeg and the cache header', async () => {
    const { GET } = await import('../api/photo.js')
    const res = await GET(
      new Request(`http://localhost/api/photo?id=${encodeURIComponent(PHOTO_ID)}`, {
        headers: { cookie: sessionCookieHeader() },
      }),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(res.headers.get('cache-control')).toBe('private, max-age=31536000, immutable')
  })
})
