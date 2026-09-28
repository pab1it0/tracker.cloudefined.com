import type { Collection, Document } from 'mongodb'
import type { AntitheftMode, ArmReason, DeviceMode } from '../shared/types.js'

const LIST_LIMIT = 100

// Collection<Document> infers _id as ObjectId; our _id is the device string, so
// filters/updates run against this narrower shape instead.
interface ModeDoc extends Document {
  _id: string
  device: string
  mode: string
  changed_at: Date | null
  changed_by: string | null
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

function toChangedBy(value: unknown): 'web' | ArmReason | null {
  if (value === 'web' || value === 'airplane' || value === 'charger') return value
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
    changedBy: toChangedBy(doc.changed_by),
  }
}

/** Upserts a check-in for a device, bumping last_checked_at without touching mode/changed_at. */
export async function checkIn(col: Collection<Document>, device: string, now: Date): Promise<DeviceMode> {
  const doc = await typed(col).findOneAndUpdate(
    { _id: device },
    {
      $set: { last_checked_at: now },
      $setOnInsert: { device, mode: 'disarmed', changed_at: null, changed_by: null },
    },
    { upsert: true, returnDocument: 'after' },
  )
  const mapped = toDeviceMode(doc as Document)
  if (mapped === null) throw new Error('checkIn: upsert returned no document')
  return mapped
}

/** Looks up a single device's mode, or null if it has no doc. */
export async function getMode(col: Collection<Document>, device: string): Promise<DeviceMode | null> {
  const doc = await typed(col).findOne({ _id: device })
  return toDeviceMode(doc)
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

/** Sets mode on an existing device only (no upsert). changed_at/changed_by move only on an actual transition. */
export async function setMode(
  col: Collection<Document>,
  device: string,
  mode: AntitheftMode,
  now: Date,
): Promise<DeviceMode | null> {
  await typed(col).updateOne(
    { _id: device, mode: { $ne: mode } },
    { $set: { mode, changed_at: now, changed_by: 'web' } },
  )
  const doc = await typed(col).findOne({ _id: device })
  return toDeviceMode(doc)
}

/**
 * Arms a device for the given reason. Upserts; only sets mode/changed_at/changed_by on a
 * real transition to armed (already-armed devices keep their existing changed_at/changed_by).
 * Always bumps last_checked_at, since this counts as a check-in.
 */
export async function arm(
  col: Collection<Document>,
  device: string,
  reason: ArmReason,
  now: Date,
): Promise<DeviceMode> {
  const typedCol = typed(col)

  // Ensure the doc exists without clobbering an existing one.
  await typedCol.updateOne(
    { _id: device },
    { $setOnInsert: { device, mode: 'disarmed', changed_at: null, changed_by: null } },
    { upsert: true },
  )

  // Transition to armed only if not already armed.
  await typedCol.updateOne(
    { _id: device, mode: { $ne: 'armed' } },
    { $set: { mode: 'armed', changed_at: now, changed_by: reason } },
  )

  await typedCol.updateOne({ _id: device }, { $set: { last_checked_at: now } })

  const doc = await typedCol.findOne({ _id: device })
  const mapped = toDeviceMode(doc as Document)
  if (mapped === null) throw new Error('arm: upsert returned no document')
  return mapped
}
