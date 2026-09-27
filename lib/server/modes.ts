import type { Collection, Document } from 'mongodb'
import type { AntitheftMode, DeviceMode } from '../shared/types.js'

const LIST_LIMIT = 100

// Collection<Document> infers _id as ObjectId; our _id is the device string, so
// filters/updates run against this narrower shape instead.
interface ModeDoc extends Document {
  _id: string
  device: string
  mode: string
  changed_at: Date | null
  last_checked_at: Date | null
}

function typed(col: Collection<Document>): Collection<ModeDoc> {
  return col as unknown as Collection<ModeDoc>
}

function toIsoOrNull(value: unknown): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return value.toISOString()
  }
  return null
}

/** Maps a raw Mongo document to a DeviceMode. Anything other than mode 'armed' reads as 'disarmed' (fail closed). */
export function toDeviceMode(doc: Document | null | undefined): DeviceMode | null {
  if (!doc) return null
  const device = doc.device
  if (typeof device !== 'string') return null
  const mode: AntitheftMode = doc.mode === 'armed' ? 'armed' : 'disarmed'
  return {
    device,
    mode,
    since: toIsoOrNull(doc.changed_at),
    lastCheckedAt: toIsoOrNull(doc.last_checked_at),
  }
}

/** Upserts a check-in for a device, bumping last_checked_at without touching mode/changed_at. */
export async function checkIn(col: Collection<Document>, device: string, now: Date): Promise<DeviceMode> {
  const doc = await typed(col).findOneAndUpdate(
    { _id: device },
    { $set: { last_checked_at: now }, $setOnInsert: { device, mode: 'disarmed', changed_at: null } },
    { upsert: true, returnDocument: 'after' },
  )
  const mapped = toDeviceMode(doc as Document)
  if (mapped === null) throw new Error('checkIn: upsert returned no document')
  return mapped
}

/** All device modes, sorted by device asc, capped at 100. */
export async function listModes(col: Collection<Document>): Promise<DeviceMode[]> {
  const docs = await typed(col).find({}).sort({ device: 1 }).limit(LIST_LIMIT).toArray()
  const modes: DeviceMode[] = []
  for (const doc of docs) {
    const mode = toDeviceMode(doc)
    if (mode !== null) modes.push(mode)
  }
  return modes
}

/** Sets mode on an existing device only (no upsert). changed_at moves only on an actual transition. */
export async function setMode(
  col: Collection<Document>,
  device: string,
  mode: AntitheftMode,
  now: Date,
): Promise<DeviceMode | null> {
  await typed(col).updateOne({ _id: device, mode: { $ne: mode } }, { $set: { mode, changed_at: now } })
  const doc = await typed(col).findOne({ _id: device })
  return toDeviceMode(doc)
}
