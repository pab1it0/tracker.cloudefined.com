export class ConfigError extends Error {
  constructor(public readonly varName: string, message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

export interface Env {
  mongodbUri: string
  mongodbDb: string
  mongodbCollection: string
  mongodbRoutesView: string
  mongodbModesCollection: string
  mongodbPhotosCollection: string
  trackerPassword: string
  sessionSecret: string
}

function required(name: string): string {
  const value = process.env[name]
  if (!value || value.trim() === '') {
    throw new ConfigError(name, `missing required env var ${name}`)
  }
  return value
}

/** Reads and validates server env vars. Throws ConfigError naming the offending var. */
export function readEnv(): Env {
  const sessionSecret = required('SESSION_SECRET')
  if (sessionSecret.length < 32) {
    throw new ConfigError('SESSION_SECRET', 'SESSION_SECRET must be at least 32 characters')
  }

  return {
    mongodbUri: required('MONGODB_URI'),
    mongodbDb: process.env.MONGODB_DB?.trim() || 'n8n',
    mongodbCollection: process.env.MONGODB_COLLECTION?.trim() || 'antitheft_locations',
    mongodbRoutesView: process.env.MONGODB_ROUTES_VIEW?.trim() || 'antitheft_routes',
    mongodbModesCollection: process.env.MONGODB_MODES_COLLECTION?.trim() || 'antitheft_modes',
    mongodbPhotosCollection: process.env.MONGODB_PHOTOS_COLLECTION?.trim() || 'antitheft_photos',
    trackerPassword: required('TRACKER_PASSWORD'),
    sessionSecret,
  }
}

/** Reads the phone auth token. Not part of readEnv(): unset ANTITHEFT_TOKEN must not break other routes. */
export function readAntitheftToken(): string {
  const token = process.env.ANTITHEFT_TOKEN
  if (!token || token.trim() === '') {
    throw new ConfigError('ANTITHEFT_TOKEN', 'missing required env var ANTITHEFT_TOKEN')
  }
  if (token.length < 32) {
    throw new ConfigError('ANTITHEFT_TOKEN', 'ANTITHEFT_TOKEN must be at least 32 characters')
  }
  return token
}

export interface HomeConfig {
  lat: number | null
  lon: number | null
  radiusM: number
  knownWifi: string[]
}

function parseCoord(name: string, min: number, max: number): number | null {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return null
  const value = Number(raw)
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new ConfigError(name, `${name} must be a number between ${min} and ${max}`)
  }
  return value
}

/** Reads the optional home location/Wi-Fi config used for arm-on-charger. Not part of readEnv(). */
export function readHomeConfig(): HomeConfig {
  const lat = parseCoord('HOME_LAT', -90, 90)
  const lon = parseCoord('HOME_LON', -180, 180)
  if ((lat === null) !== (lon === null)) {
    throw new ConfigError('HOME_LAT', 'HOME_LAT and HOME_LON must both be set or both be unset')
  }

  const radiusRaw = process.env.HOME_RADIUS_M?.trim()
  let radiusM = 200
  if (radiusRaw) {
    const value = Number(radiusRaw)
    if (!Number.isFinite(value) || value <= 0) {
      throw new ConfigError('HOME_RADIUS_M', 'HOME_RADIUS_M must be a positive number')
    }
    radiusM = value
  }

  const knownWifi = (process.env.KNOWN_WIFI ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  return { lat, lon, radiusM, knownWifi }
}
