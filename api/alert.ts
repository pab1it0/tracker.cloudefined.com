import { readEnv, readHomeConfig } from '../lib/server/env.js'
import { withErrors, error, json } from '../lib/server/http.js'
import { authorizePhone, readFields } from '../lib/server/phone.js'
import { getCollection, getModesCollection, getPhotosCollection } from '../lib/server/mongo.js'
import { parseAlert } from '../lib/server/ingest.js'
import { upsertPoint } from '../lib/server/points.js'
import { arm, checkIn } from '../lib/server/modes.js'
import { armReason } from '../lib/server/arming.js'
import { processImage, sniffImage, storePhoto } from '../lib/server/photos.js'

const MAX_BODY_BYTES = 4 * 1024 * 1024
const CAMERAS = ['photo_front', 'photo_back'] as const
const CAMERA_NAME: Record<(typeof CAMERAS)[number], 'front' | 'back'> = {
  photo_front: 'front',
  photo_back: 'back',
}

export const POST = withErrors(async (request: Request) => {
  const parsed = await readFields(request, MAX_BODY_BYTES)
  if (!parsed.ok) return error(parsed.status, parsed.message)

  const alert = parseAlert(parsed.value.fields)
  if (!alert.ok) return json({ error: 'invalid body', errors: alert.errors }, 400)

  const unauthorized = await authorizePhone(request)
  if (unauthorized) return unauthorized

  const hasLatLon = alert.value.lat !== null && alert.value.lon !== null
  const usableLocation = hasLatLon && !(alert.value.lat === 0 && alert.value.lon === 0)

  const env = readEnv()
  const modesCol = getModesCollection(env)
  const home = readHomeConfig()

  const reason = armReason(
    { trigger: alert.value.trigger, ssid: alert.value.ssid, lat: alert.value.lat, lon: alert.value.lon },
    home,
  )

  const now = new Date()
  const result = reason
    ? await arm(modesCol, alert.value.device, reason, now)
    : await checkIn(modesCol, alert.value.device, now)

  const locationsCol = getCollection(env)
  if (usableLocation) {
    await upsertPoint(
      locationsCol,
      {
        device: alert.value.device,
        session: null,
        ts: alert.value.timestamp,
        accuracyM: alert.value.accuracyM,
        altitudeM: null,
        speedMps: null,
        battery: alert.value.battery,
        lat: alert.value.lat as number,
        lon: alert.value.lon as number,
      },
      now,
    )
  }

  let photosStored = 0
  if (result.mode === 'armed') {
    const files: { camera: 'front' | 'back'; buf: Uint8Array }[] = []
    for (const field of CAMERAS) {
      const file = parsed.value.files[field]
      if (!file) continue
      if (file.size > 4 * 1024 * 1024) return error(413, 'photo too large')
      const buf = new Uint8Array(await file.arrayBuffer())
      const kind = sniffImage(buf)
      if (kind === null || kind === 'heic') return error(415, 'photos must be JPEG or PNG')
      files.push({ camera: CAMERA_NAME[field], buf })
    }

    const processed: { camera: 'front' | 'back'; image: Awaited<ReturnType<typeof processImage>> }[] = []
    for (const file of files) {
      try {
        processed.push({ camera: file.camera, image: await processImage(file.buf) })
      } catch {
        return error(415, 'photos must be JPEG or PNG')
      }
    }

    const photosCol = getPhotosCollection(env)
    for (const file of processed) {
      await storePhoto(
        photosCol,
        locationsCol,
        {
          device: alert.value.device,
          camera: file.camera,
          trigger: alert.value.trigger,
          ts: alert.value.timestamp,
          now,
          alertLoc: { lat: alert.value.lat, lon: alert.value.lon },
        },
        file.image,
      )
      photosStored += 1
    }
  }

  return json(
    {
      status: 'accepted',
      device: alert.value.device,
      mode: result.mode,
      armedBy: reason,
      photos: photosStored,
    },
    202,
  )
})
