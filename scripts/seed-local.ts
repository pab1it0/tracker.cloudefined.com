// Self-contained local dev seeder: (re)creates the antitheft_locations collection
// (validator + indexes), the antitheft_routes view, the antitheft_modes collection,
// the least-privilege roles/user, and synthetic route data for device "Demo iPhone".
// Reads/writes .env.local itself. Runnable directly by Node's built-in TypeScript
// type stripping: erasable syntax only.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { randomBytes, randomInt } from 'node:crypto'
import { MongoClient } from 'mongodb'

const ENV_PATH = new URL('../.env.local', import.meta.url)
const DB_NAME = 'n8n'
const COLLECTION_NAME = 'antitheft_locations'
const VIEW_NAME = 'antitheft_routes'
const ROLE_NAME = 'antitheftReader'
const MODES_COLLECTION_NAME = 'antitheft_modes'
const MODES_ROLE_NAME = 'antitheftModeWriter'
const APP_USER = 'antitheft_webapp'
const DEVICE = 'Demo iPhone'

interface LonLat {
  0: number
  1: number
}

// ---------- tiny .env parser/writer ----------

function parseEnvFile(path: URL): Record<string, string> {
  if (!existsSync(path)) return {}
  const text = readFileSync(path, 'utf8')
  const env: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
  }
  return env
}

function upsertEnvKeys(path: URL, updates: Record<string, string>, onlyIfAbsent: string[]): void {
  const existing = parseEnvFile(path)
  const lines = existsSync(path) ? readFileSync(path, 'utf8').split('\n') : []
  const seen = new Set<string>()

  const nextLines = lines.map((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return line
    const idx = trimmed.indexOf('=')
    if (idx === -1) return line
    const key = trimmed.slice(0, idx).trim()
    if (!(key in updates)) return line
    if (onlyIfAbsent.includes(key) && key in existing) {
      seen.add(key)
      return line
    }
    seen.add(key)
    return `${key}=${updates[key]}`
  })

  const appended: string[] = []
  for (const [key, value] of Object.entries(updates)) {
    if (seen.has(key)) continue
    if (onlyIfAbsent.includes(key) && key in existing) continue
    appended.push(`${key}=${value}`)
  }

  const finalText = [...nextLines, ...appended].join('\n').replace(/\n{3,}/g, '\n\n')
  writeFileSync(path, finalText.endsWith('\n') ? finalText : `${finalText}\n`, 'utf8')
}

// ---------- geometry helpers (self-contained; no cross-import from lib/shared) ----------

const EARTH_RADIUS_M = 6_371_000

function haversineM(a: LonLat, b: LonLat): number {
  const phi1 = (a[1] * Math.PI) / 180
  const phi2 = (b[1] * Math.PI) / 180
  const dPhi = ((b[1] - a[1]) * Math.PI) / 180
  const dLambda = ((b[0] - a[0]) * Math.PI) / 180
  const h = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function jitterMeters(point: LonLat, metersStdDev: number): LonLat {
  const latRad = (point[1] * Math.PI) / 180
  const metersPerDegLat = 111_320
  const metersPerDegLon = 111_320 * Math.cos(latRad)
  const dLat = (randomGaussian() * metersStdDev) / metersPerDegLat
  const dLon = (randomGaussian() * metersStdDev) / metersPerDegLon
  return [point[0] + dLon, point[1] + dLat]
}

function randomGaussian(): number {
  const u1 = Math.max(Number.EPSILON, Math.random())
  const u2 = Math.random()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

/** Resamples a polyline into `count` points, evenly spaced by cumulative distance. */
function resampleByDistance(coords: LonLat[], count: number): LonLat[] {
  if (coords.length === 0) return []
  if (coords.length === 1 || count <= 1) return Array.from({ length: count }, () => coords[0]!)

  const cumulative: number[] = [0]
  for (let i = 1; i < coords.length; i++) {
    cumulative.push(cumulative[i - 1]! + haversineM(coords[i - 1]!, coords[i]!))
  }
  const total = cumulative[cumulative.length - 1]!

  const out: LonLat[] = []
  for (let i = 0; i < count; i++) {
    const target = total * (i / (count - 1))
    let segIdx = cumulative.findIndex((d) => d >= target)
    if (segIdx <= 0) segIdx = 1
    const distBefore = cumulative[segIdx - 1]!
    const distAfter = cumulative[segIdx]!
    const segLen = distAfter - distBefore
    const t = segLen > 0 ? (target - distBefore) / segLen : 0
    const a = coords[segIdx - 1]!
    const b = coords[segIdx]!
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
  }
  return out
}

function straightLineFallback(from: LonLat, to: LonLat, steps = 40): LonLat[] {
  const coords: LonLat[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const base: LonLat = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]
    coords.push(jitterMeters(base, 6))
  }
  return coords
}

type Profile = 'foot' | 'bike' | 'driving'

async function fetchRoute(profile: Profile, from: LonLat, to: LonLat): Promise<LonLat[]> {
  const url = `https://router.project-osrm.org/route/v1/${profile}/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error(`OSRM ${res.status}`)
    const data = (await res.json()) as {
      code?: string
      routes?: { geometry?: { coordinates?: [number, number][] } }[]
    }
    const coords = data.routes?.[0]?.geometry?.coordinates
    if (data.code !== 'Ok' || !coords || coords.length < 2) throw new Error('OSRM: no route')
    return coords as LonLat[]
  } catch (err) {
    console.error(`  OSRM fetch failed (${(err as Error).message}); falling back to straight line.`)
    return straightLineFallback(from, to)
  }
}

// ---------- landmarks (central Tel Aviv / Jaffa only, per repo policy) ----------

const LANDMARKS: Record<string, LonLat> = {
  JAFFA_PORT: [34.7519, 32.0524],
  JAFFA_CLOCK_TOWER: [34.7526, 32.0555],
  JAFFA_FLEA_MARKET: [34.755, 32.0548],
  NEVE_TZEDEK: [34.7625, 32.0602],
  ROTHSCHILD_START: [34.7686, 32.0614],
  ROTHSCHILD_END: [34.7745, 32.0644],
  CARMEL_MARKET: [34.7688, 32.0685],
  HABIMA_SQUARE: [34.7739, 32.0667],
}

function sessionIdFor(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  const h = String(date.getUTCHours()).padStart(2, '0')
  return `${y}${m}${d}${h}`
}

interface SeedPoint {
  point_id: string
  device: string
  session: string | null
  ts: Date
  received_at: Date
  loc: { type: 'Point'; coordinates: [number, number] }
  accuracy_m: number | null
  altitude_m: number | null
  speed_mps: number | null
  battery: number | null
}

interface SessionPlan {
  fromKey: string
  toKey: string
  profile: Profile
  durationMin: number
  start: Date
}

async function buildSessionPoints(
  plan: SessionPlan,
  batteryStart: number,
  addSpike: boolean,
): Promise<SeedPoint[]> {
  const from = LANDMARKS[plan.fromKey]!
  const to = LANDMARKS[plan.toKey]!
  const route = await fetchRoute(plan.profile, from, to)

  const n = Math.max(2, Math.round(plan.durationMin))
  const resampled = resampleByDistance(route, n)
  const session = sessionIdFor(plan.start)

  const points: SeedPoint[] = []
  for (let i = 0; i < n; i++) {
    const jitterS = randomInt(-10, 11)
    const ts = new Date(plan.start.getTime() + i * 60_000 + jitterS * 1000)
    let coord = jitterMeters(resampled[i]!, 5)

    if (addSpike && (i === Math.floor(n / 3) || i === Math.floor((2 * n) / 3))) {
      coord = [coord[0] + 0.01 * (Math.random() > 0.5 ? 1 : -1), coord[1] + 0.01 * (Math.random() > 0.5 ? 1 : -1)]
    }

    const battery = Math.max(1, Math.round(batteryStart - (i / n) * randomInt(3, 12)))
    const receivedAt = new Date(ts.getTime() + randomInt(0, 3000))

    points.push({
      point_id: `${DEVICE}|${ts.toISOString()}`,
      device: DEVICE,
      session,
      ts,
      received_at: receivedAt,
      loc: { type: 'Point', coordinates: [coord[0], coord[1]] },
      accuracy_m: randomInt(4, 36),
      altitude_m: randomInt(5, 41),
      speed_mps: null,
      battery,
    })
  }
  return points
}

function buildNullSessionPoints(day: Date): SeedPoint[] {
  const landmark = LANDMARKS.JAFFA_PORT!
  const points: SeedPoint[] = []
  const count = randomInt(6, 10)
  for (let i = 0; i < count; i++) {
    const ts = new Date(day.getTime() + i * 60_000 + randomInt(-8, 9) * 1000)
    const coord = jitterMeters(landmark, 15)
    points.push({
      point_id: `${DEVICE}|${ts.toISOString()}`,
      device: DEVICE,
      session: null,
      ts,
      received_at: new Date(ts.getTime() + randomInt(0, 3000)),
      loc: { type: 'Point', coordinates: [coord[0], coord[1]] },
      accuracy_m: randomInt(4, 36),
      altitude_m: randomInt(5, 41),
      speed_mps: null,
      battery: randomInt(40, 90),
    })
  }
  return points
}

async function main(): Promise<void> {
  const env = parseEnvFile(ENV_PATH)
  const adminUri = env.MONGODB_ADMIN_URI
  if (!adminUri) {
    console.error('MONGODB_ADMIN_URI not found in .env.local. Run scripts/local-mongo.sh first.')
    process.exit(1)
  }

  const client = new MongoClient(adminUri, { appName: 'tracker-seed' })
  await client.connect()

  try {
    const db = client.db(DB_NAME)
    const adminDb = client.db('admin')

    console.log(`Recreating ${DB_NAME}.${COLLECTION_NAME} with validator + indexes...`)
    const collections = await db.listCollections({ name: COLLECTION_NAME }).toArray()
    if (collections.length > 0) await db.dropCollection(COLLECTION_NAME)

    const schema = {
      $jsonSchema: {
        bsonType: 'object',
        required: ['point_id', 'device', 'ts', 'received_at', 'loc'],
        properties: {
          point_id: { bsonType: 'string', maxLength: 200 },
          device: { bsonType: 'string', maxLength: 64 },
          session: { bsonType: ['string', 'null'], maxLength: 64 },
          ts: { bsonType: 'date' },
          received_at: { bsonType: 'date' },
          loc: {
            bsonType: 'object',
            required: ['type', 'coordinates'],
            properties: {
              type: { enum: ['Point'] },
              coordinates: { bsonType: 'array', minItems: 2, maxItems: 2, items: { bsonType: 'number' } },
            },
          },
          accuracy_m: { bsonType: ['number', 'null'] },
          altitude_m: { bsonType: ['number', 'null'] },
          speed_mps: { bsonType: ['number', 'null'] },
          battery: { bsonType: ['number', 'null'], minimum: 0, maximum: 100 },
        },
      },
    }
    await db.createCollection(COLLECTION_NAME, {
      validator: schema,
      validationLevel: 'strict',
      validationAction: 'error',
    })

    const col = db.collection(COLLECTION_NAME)
    await col.createIndex({ point_id: 1 }, { unique: true, name: 'uniq_point_id' })
    await col.createIndex({ device: 1, ts: 1 }, { name: 'device_ts' })
    await col.createIndex(
      { session: 1, ts: 1 },
      { name: 'session_ts', partialFilterExpression: { session: { $type: 'string' } } },
    )
    await col.createIndex({ loc: '2dsphere' }, { name: 'loc_2dsphere' })

    console.log(`Recreating view ${DB_NAME}.${VIEW_NAME}...`)
    const views = await db.listCollections({ name: VIEW_NAME }).toArray()
    if (views.length > 0) await db.dropCollection(VIEW_NAME)
    await db.createCollection(VIEW_NAME, {
      viewOn: COLLECTION_NAME,
      pipeline: [
        { $sort: { ts: 1 } },
        {
          $group: {
            _id: { device: '$device', session: '$session' },
            start: { $first: '$ts' },
            end: { $last: '$ts' },
            points: { $sum: 1 },
            coordinates: { $push: '$loc.coordinates' },
            last_battery: { $last: '$battery' },
          },
        },
        {
          $project: {
            _id: 0,
            device: '$_id.device',
            session: '$_id.session',
            start: 1,
            end: 1,
            points: 1,
            last_battery: 1,
            route: { type: 'LineString', coordinates: '$coordinates' },
          },
        },
        { $sort: { start: -1 } },
      ],
    })

    console.log(`Recreating collection ${DB_NAME}.${MODES_COLLECTION_NAME}...`)
    const modesCollections = await db.listCollections({ name: MODES_COLLECTION_NAME }).toArray()
    if (modesCollections.length > 0) await db.dropCollection(MODES_COLLECTION_NAME)
    await db.createCollection(MODES_COLLECTION_NAME)
    const modesCol = db.collection<{
      _id: string
      device: string
      mode: string
      changed_at: Date | null
      last_checked_at: Date | null
    }>(MODES_COLLECTION_NAME)
    await modesCol.updateOne(
      { _id: DEVICE },
      { $set: { device: DEVICE, mode: 'armed', changed_at: new Date(), last_checked_at: null } },
      { upsert: true },
    )

    console.log(`Recreating role ${ROLE_NAME} and user ${APP_USER}...`)
    try {
      await adminDb.command({ dropUser: APP_USER })
    } catch {
      // user did not exist yet
    }
    try {
      await adminDb.command({ dropRole: ROLE_NAME })
    } catch {
      // role did not exist yet
    }
    try {
      await adminDb.command({ dropRole: MODES_ROLE_NAME })
    } catch {
      // role did not exist yet
    }
    await adminDb.command({
      createRole: ROLE_NAME,
      privileges: [
        { resource: { db: DB_NAME, collection: COLLECTION_NAME }, actions: ['find'] },
        { resource: { db: DB_NAME, collection: VIEW_NAME }, actions: ['find'] },
      ],
      roles: [],
    })
    await adminDb.command({
      createRole: MODES_ROLE_NAME,
      privileges: [
        { resource: { db: DB_NAME, collection: MODES_COLLECTION_NAME }, actions: ['find', 'insert', 'update'] },
      ],
      roles: [],
    })
    const appPassword = randomBytes(18).toString('base64url')
    await adminDb.command({
      createUser: APP_USER,
      pwd: appPassword,
      roles: [
        { role: ROLE_NAME, db: 'admin' },
        { role: MODES_ROLE_NAME, db: 'admin' },
      ],
    })

    const trackerPassword = env.TRACKER_PASSWORD ?? randomBytes(9).toString('base64url').slice(0, 12)
    const sessionSecret = env.SESSION_SECRET ?? randomBytes(32).toString('hex')
    const antitheftToken = env.ANTITHEFT_TOKEN ?? randomBytes(32).toString('hex')

    upsertEnvKeys(
      ENV_PATH,
      {
        MONGODB_URI: `mongodb://${APP_USER}:${appPassword}@127.0.0.1:27018/?authSource=admin`,
        MONGODB_DB: DB_NAME,
        MONGODB_COLLECTION: COLLECTION_NAME,
        MONGODB_ROUTES_VIEW: VIEW_NAME,
        MONGODB_MODES_COLLECTION: MODES_COLLECTION_NAME,
        TRACKER_PASSWORD: trackerPassword,
        SESSION_SECRET: sessionSecret,
        ANTITHEFT_TOKEN: antitheftToken,
      },
      ['TRACKER_PASSWORD', 'SESSION_SECRET', 'ANTITHEFT_TOKEN'],
    )

    console.log('Generating synthetic routes for device "Demo iPhone"...')
    const now = Date.now()
    const landmarkKeys = Object.keys(LANDMARKS)
    const profiles: Profile[] = ['foot', 'bike', 'driving']

    const historicalPlans: SessionPlan[] = []
    for (let i = 0; i < 7; i++) {
      const dayOffset = randomInt(1, 6)
      const hour = randomInt(6, 22)
      const start = new Date(now - dayOffset * 24 * 60 * 60 * 1000)
      start.setUTCHours(hour, randomInt(0, 60), randomInt(0, 60), 0)
      const fromKey = landmarkKeys[randomInt(0, landmarkKeys.length)]!
      let toKey = landmarkKeys[randomInt(0, landmarkKeys.length)]!
      while (toKey === fromKey) toKey = landmarkKeys[randomInt(0, landmarkKeys.length)]!
      historicalPlans.push({
        fromKey,
        toKey,
        profile: profiles[randomInt(0, profiles.length)]!,
        durationMin: randomInt(20, 56),
        start,
      })
    }

    // Current, in-progress session: last point ~40s before now.
    const liveDurationMin = randomInt(12, 30)
    const lastPointAt = new Date(now - 40_000)
    const liveStart = new Date(lastPointAt.getTime() - (liveDurationMin - 1) * 60_000)
    const liveFromKey = landmarkKeys[randomInt(0, landmarkKeys.length)]!
    let liveToKey = landmarkKeys[randomInt(0, landmarkKeys.length)]!
    while (liveToKey === liveFromKey) liveToKey = landmarkKeys[randomInt(0, landmarkKeys.length)]!
    const livePlan: SessionPlan = {
      fromKey: liveFromKey,
      toKey: liveToKey,
      profile: profiles[randomInt(0, profiles.length)]!,
      durationMin: liveDurationMin,
      start: liveStart,
    }

    const spikeIndexes = new Set<number>([randomInt(0, 8), randomInt(0, 8)])
    const allPoints: SeedPoint[] = []

    for (let i = 0; i < historicalPlans.length; i++) {
      const points = await buildSessionPoints(historicalPlans[i]!, randomInt(60, 100), spikeIndexes.has(i))
      allPoints.push(...points)
    }
    const livePoints = await buildSessionPoints(livePlan, randomInt(70, 95), false)
    allPoints.push(...livePoints)

    const nullSessionDay = new Date(now - 3 * 24 * 60 * 60 * 1000)
    nullSessionDay.setUTCHours(11, 0, 0, 0)
    const nullPoints = buildNullSessionPoints(nullSessionDay)
    allPoints.push(...nullPoints)

    await col.deleteMany({ device: DEVICE })
    if (allPoints.length > 0) await col.insertMany(allPoints)

    console.log(
      `Seeded ${allPoints.length} points across ${historicalPlans.length + 1} sessions ` +
        `(+ ${nullPoints.length} null-session points) for device "${DEVICE}".`,
    )
    console.log('Secrets written to .env.local (not printed here).')
  } finally {
    await client.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
