import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Collection, Document } from 'mongodb'
import sharp from 'sharp'

const TOKEN = 'b'.repeat(64)

const modesStore = new Map<string, Document>()
const locationsStore = new Map<string, Document>()
const photosStore = new Map<string, Document>()

function applyUpdate(doc: Document, update: Document): void {
  if (update.$set) Object.assign(doc, update.$set)
}

function fakeModesCollection(): Collection<Document> {
  return {
    updateOne: vi.fn(async (filter: Document, update: Document, options?: Document) => {
      const id = filter._id as string
      let doc = modesStore.get(id)
      if (!doc) {
        if (options?.upsert) {
          doc = { _id: id, ...(update.$setOnInsert as Document) }
          modesStore.set(id, doc)
        } else {
          return { matchedCount: 0 }
        }
      }
      if (filter.mode && '$ne' in (filter.mode as Document) && doc.mode === (filter.mode as Document).$ne) {
        return { matchedCount: 1, modifiedCount: 0 }
      }
      applyUpdate(doc, update)
      return { matchedCount: 1, modifiedCount: 1 }
    }),
    findOne: vi.fn(async (filter: Document) => modesStore.get(filter._id as string) ?? null),
    findOneAndUpdate: vi.fn(async (filter: Document, update: Document) => {
      const id = filter._id as string
      let doc = modesStore.get(id)
      if (!doc) {
        doc = { _id: id, ...(update.$setOnInsert as Document) }
        modesStore.set(id, doc)
      }
      applyUpdate(doc, update)
      return doc
    }),
  } as unknown as Collection<Document>
}

function fakeLocationsCollection(): Collection<Document> {
  return {
    updateOne: vi.fn(async (filter: Document, update: Document) => {
      const id = filter.point_id as string
      const existing = locationsStore.get(id) ?? {}
      locationsStore.set(id, { ...existing, ...(update.$set as Document) })
      return { upsertedCount: 1 }
    }),
    find: vi.fn(() => ({ toArray: async () => [] })),
  } as unknown as Collection<Document>
}

function fakePhotosCollection(): Collection<Document> {
  return {
    updateOne: vi.fn(async (filter: Document, update: Document) => {
      const id = filter._id as string
      const existing = photosStore.get(id) ?? {}
      photosStore.set(id, { ...existing, ...(update.$set as Document) })
      return { upsertedCount: 1 }
    }),
  } as unknown as Collection<Document>
}

vi.mock('../lib/server/mongo.js', () => ({
  getModesCollection: () => fakeModesCollection(),
  getCollection: () => fakeLocationsCollection(),
  getPhotosCollection: () => fakePhotosCollection(),
}))

beforeAll(() => {
  process.env.MONGODB_URI = 'mongodb://example/test'
  process.env.TRACKER_PASSWORD = 'correct-horse-battery-staple'
  process.env.SESSION_SECRET = 'a'.repeat(32)
  process.env.ANTITHEFT_TOKEN = TOKEN
  process.env.HOME_LAT = '32.0524'
  process.env.HOME_LON = '34.7519'
  process.env.HOME_RADIUS_M = '200'
  process.env.KNOWN_WIFI = 'DemoHomeWiFi'
})

const HOME = { lat: '32.0524', lon: '34.7519' }
const AWAY = { lat: '32.0524', lon: '34.77' }

async function makeJpeg(): Promise<Buffer> {
  return sharp({ create: { width: 200, height: 200, channels: 3, background: { r: 10, g: 100, b: 10 } } })
    .jpeg()
    .toBuffer()
}

async function postAlertJson(body: Record<string, unknown>, ip = `ip-${Math.random()}`): Promise<Response> {
  const { POST } = await import('../api/alert.js')
  const request = new Request('http://localhost/api/alert', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, 'x-antitheft-token': TOKEN },
    body: JSON.stringify(body),
  })
  return POST(request)
}

async function postAlertMultipart(
  fields: Record<string, string>,
  files: Record<string, Buffer>,
  ip = `ip-${Math.random()}`,
): Promise<Response> {
  const { POST } = await import('../api/alert.js')
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.append(key, value)
  for (const [key, buf] of Object.entries(files)) {
    form.append(key, new File([new Uint8Array(buf)], `${key}.jpg`, { type: 'image/jpeg' }))
  }
  const request = new Request('http://localhost/api/alert', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip, 'x-antitheft-token': TOKEN },
    body: form,
  })
  return POST(request)
}

describe('POST /api/alert', () => {
  it('airplane trigger arms (changed_by airplane) and stores the point', async () => {
    const device = `Airplane-${Math.random()}`
    const timestamp = new Date().toISOString()
    const res = await postAlertJson({ trigger: 'airplane', timestamp, device, lat: '32.05', lon: '34.75' })
    expect(res.status).toBe(202)
    const body = (await res.json()) as { mode: string; armedBy: string }
    expect(body.mode).toBe('armed')
    expect(body.armedBy).toBe('airplane')
    expect(modesStore.get(device)?.changed_by).toBe('airplane')
    expect(locationsStore.has(`${device}|${timestamp}`)).toBe(true)
  })

  it('charger at home on known Wi-Fi does not arm and stores no photos', async () => {
    const device = `ChargerHome-${Math.random()}`
    const jpeg = await makeJpeg()
    const res = await postAlertMultipart(
      { trigger: 'charger', timestamp: new Date().toISOString(), device, ssid: 'DemoHomeWiFi', ...HOME },
      { photo_front: jpeg },
    )
    expect(res.status).toBe(202)
    const body = (await res.json()) as { mode: string; armedBy: string | null; photos: number }
    expect(body.mode).toBe('disarmed')
    expect(body.armedBy).toBeNull()
    expect(body.photos).toBe(0)
  })

  it('charger away arms', async () => {
    const device = `ChargerAway-${Math.random()}`
    const res = await postAlertJson({
      trigger: 'charger',
      timestamp: new Date().toISOString(),
      device,
      ssid: 'CoffeeShop',
      ...AWAY,
    })
    expect(res.status).toBe(202)
    const body = (await res.json()) as { mode: string; armedBy: string }
    expect(body.mode).toBe('armed')
    expect(body.armedBy).toBe('charger')
  })

  it('a disarmed heartbeat with a photo stores 0 photos', async () => {
    const device = `HeartbeatDisarmed-${Math.random()}`
    const jpeg = await makeJpeg()
    const res = await postAlertMultipart(
      { trigger: 'heartbeat', timestamp: new Date().toISOString(), device },
      { photo_front: jpeg },
    )
    expect(res.status).toBe(202)
    const body = (await res.json()) as { photos: number; mode: string }
    expect(body.mode).toBe('disarmed')
    expect(body.photos).toBe(0)
  })

  it('an armed heartbeat stores photos', async () => {
    const device = `HeartbeatArmed-${Math.random()}`
    modesStore.set(device, { _id: device, device, mode: 'armed', changed_at: null, changed_by: null })
    const jpeg = await makeJpeg()
    const res = await postAlertMultipart(
      { trigger: 'heartbeat', timestamp: new Date().toISOString(), device },
      { photo_front: jpeg, photo_back: jpeg },
    )
    expect(res.status).toBe(202)
    const body = (await res.json()) as { photos: number; mode: string }
    expect(body.mode).toBe('armed')
    expect(body.photos).toBe(2)
    expect(photosStore.size).toBeGreaterThan(0)
  })

  it('HEIC upload gets 415 and nothing is stored', async () => {
    const device = `Heic-${Math.random()}`
    modesStore.set(device, { _id: device, device, mode: 'armed', changed_at: null, changed_by: null })
    const heic = Buffer.alloc(16)
    heic.set([0, 0, 0, 0x18], 0)
    heic.write('ftyp', 4)
    const photosBefore = photosStore.size
    const res = await postAlertMultipart({ trigger: 'heartbeat', timestamp: new Date().toISOString(), device }, { photo_front: heic })
    expect(res.status).toBe(415)
    expect(photosStore.size).toBe(photosBefore)
  })

  it('a body over 4 MB gets 413', async () => {
    const device = `TooBig-${Math.random()}`
    const big = Buffer.alloc(5 * 1024 * 1024, 1)
    const res = await postAlertMultipart({ trigger: 'heartbeat', timestamp: new Date().toISOString(), device }, { photo_front: big })
    expect(res.status).toBe(413)
  })

  it('accepts multipart with a real small JPEG', async () => {
    const device = `MultipartArmed-${Math.random()}`
    modesStore.set(device, { _id: device, device, mode: 'armed', changed_at: null, changed_by: null })
    const jpeg = await makeJpeg()
    const res = await postAlertMultipart({ trigger: 'heartbeat', timestamp: new Date().toISOString(), device }, { photo_front: jpeg })
    expect(res.status).toBe(202)
  })
})
