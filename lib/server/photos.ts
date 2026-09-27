import sharp from 'sharp'
import { Binary, type Collection, type Document } from 'mongodb'
import { nearestPoint, type PointLoc } from './points.js'

const FULL_MAX = 1600
const THUMB_SIZE = 160
const NEAREST_WINDOW_MS = 15 * 60 * 1000

// Collection<Document> infers _id as ObjectId; our _id is a composite string, so
// filters/updates run against this narrower shape instead (mirrors lib/server/modes.ts).
interface PhotoDoc extends Document {
  _id: string
}

function typedPhotos(col: Collection<Document>): Collection<PhotoDoc> {
  return col as unknown as Collection<PhotoDoc>
}

/** Sniffs image magic bytes: JPEG or PNG are accepted, HEIC is rejected explicitly, else null. */
export function sniffImage(buf: Uint8Array): 'jpeg' | 'png' | 'heic' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg'
  if (
    buf.length >= 4 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return 'png'
  }
  if (buf.length >= 8) {
    const ftyp = new TextDecoder().decode(buf.slice(4, 8))
    if (ftyp === 'ftyp') return 'heic'
  }
  return null
}

export interface ProcessedImage {
  full: Buffer
  thumb: Buffer
  width: number
  height: number
}

/** Re-encodes an image to JPEG: full (fit 1600x1600, quality 75) and thumbnail (cover 160x160, quality 70). */
export async function processImage(buf: Uint8Array): Promise<ProcessedImage> {
  const input = sharp(Buffer.from(buf), { limitInputPixels: 40_000_000, failOn: 'error' })

  const fullPipeline = input.clone().rotate().resize(FULL_MAX, FULL_MAX, { fit: 'inside', withoutEnlargement: true })
  const { data: full, info } = await fullPipeline.jpeg({ quality: 75 }).toBuffer({ resolveWithObject: true })

  const thumb = await input
    .clone()
    .rotate()
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover' })
    .jpeg({ quality: 70 })
    .toBuffer()

  return { full, thumb, width: info.width, height: info.height }
}

export interface StorePhotoInput {
  device: string
  camera: 'front' | 'back'
  trigger: string
  ts: Date
  now: Date
  alertLoc: { lat: number | null; lon: number | null }
}

/** Stores one processed photo, upserting by `${device}|${ts.toISOString()}|${camera}`. */
export async function storePhoto(
  photosCol: Collection<Document>,
  locationsCol: Collection<Document>,
  input: StorePhotoInput,
  processed: ProcessedImage,
): Promise<void> {
  let loc: PointLoc | null = null
  if (input.alertLoc.lat !== null && input.alertLoc.lon !== null) {
    loc = { type: 'Point', coordinates: [input.alertLoc.lon, input.alertLoc.lat] }
  } else {
    loc = await nearestPoint(locationsCol, input.device, input.ts, NEAREST_WINDOW_MS)
  }

  const id = `${input.device}|${input.ts.toISOString()}|${input.camera}`
  const doc = {
    _id: id,
    device: input.device,
    camera: input.camera,
    trigger: input.trigger,
    ts: input.ts,
    received_at: input.now,
    loc,
    mime: 'image/jpeg',
    bytes: new Binary(processed.full),
    thumb: new Binary(processed.thumb),
    width: processed.width,
    height: processed.height,
    size: processed.full.length,
  }
  await typedPhotos(photosCol).updateOne({ _id: id }, { $set: doc }, { upsert: true })
}

export interface PhotoMetaDoc {
  id: string
  device: string
  camera: 'front' | 'back'
  trigger: string
  t: string
  lat: number | null
  lon: number | null
  width: number
  height: number
}

const META_PROJECTION = {
  _id: 1,
  device: 1,
  camera: 1,
  trigger: 1,
  ts: 1,
  loc: 1,
  width: 1,
  height: 1,
} as const

function toMeta(doc: Document): PhotoMetaDoc | null {
  const id = doc._id
  const device = doc.device
  const camera = doc.camera
  const ts = doc.ts
  if (typeof id !== 'string' || typeof device !== 'string') return null
  if (camera !== 'front' && camera !== 'back') return null
  if (!(ts instanceof Date) || Number.isNaN(ts.getTime())) return null

  const loc = doc.loc as { coordinates?: unknown } | null | undefined
  let lat: number | null = null
  let lon: number | null = null
  if (loc && Array.isArray(loc.coordinates) && loc.coordinates.length === 2) {
    const [rawLon, rawLat] = loc.coordinates as [unknown, unknown]
    if (typeof rawLon === 'number' && typeof rawLat === 'number') {
      lon = rawLon
      lat = rawLat
    }
  }

  return {
    id,
    device,
    camera,
    trigger: typeof doc.trigger === 'string' ? doc.trigger : 'manual',
    t: ts.toISOString(),
    lat,
    lon,
    width: typeof doc.width === 'number' ? doc.width : 0,
    height: typeof doc.height === 'number' ? doc.height : 0,
  }
}

export interface PhotosRangeQuery {
  from: Date
  to: Date
  device?: string | null
}

export interface PhotosPage {
  photos: PhotoMetaDoc[]
  truncated: boolean
}

/** Photo metadata in [from, to], newest first, capped at limit. Excludes bytes/thumb via projection. */
export async function photosInRange(
  col: Collection<Document>,
  query: PhotosRangeQuery,
  limit: number,
): Promise<PhotosPage> {
  const filter: Document = { ts: { $gte: query.from, $lte: query.to } }
  if (query.device) filter.device = query.device

  const docs = await col
    .find(filter, { projection: META_PROJECTION })
    .sort({ ts: -1 })
    .limit(limit + 1)
    .toArray()

  const truncated = docs.length > limit
  const sliced = truncated ? docs.slice(0, limit) : docs
  const photos = sliced.map(toMeta).filter((p): p is PhotoMetaDoc => p !== null)
  return { photos, truncated }
}

/** Reads the raw JPEG bytes for a photo (full or thumb) by id, or null if missing. */
export async function readPhoto(col: Collection<Document>, id: string, size: 'thumb' | 'full'): Promise<Buffer | null> {
  const field = size === 'thumb' ? 'thumb' : 'bytes'
  const doc = await typedPhotos(col).findOne({ _id: id }, { projection: { [field]: 1 } })
  if (!doc) return null
  const value = doc[field]
  if (value instanceof Binary) return value.buffer as Buffer
  return null
}
