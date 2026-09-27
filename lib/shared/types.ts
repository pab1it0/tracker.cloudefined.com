export interface TrackPoint {
  t: string // ISO timestamp (phone time, "ts")
  lat: number
  lon: number
  acc: number | null // accuracy_m
  alt: number | null // altitude_m
  spd: number | null // reported speed_mps (usually null; client derives speed)
  bat: number | null // battery 0-100
  session: string | null
  device: string
}

export interface LatestPoint extends TrackPoint {
  receivedAt: string
}

export interface LatestResponse {
  serverTime: string
  devices: LatestPoint[]
}

export interface SessionSummary {
  id: string // stable: `${device}|${session}` or `${device}|trip-${startISO}` for null-session gap groups
  device: string
  session: string | null
  start: string
  end: string // ISO
  points: number
  distanceM: number
  durationS: number
  maxSpeedMps: number | null // derived
  batteryStart: number | null
  batteryEnd: number | null
  bbox: [number, number, number, number] | null // minLon, minLat, maxLon, maxLat; null if no valid coords
}

export interface SessionsResponse {
  from: string
  to: string
  sessions: SessionSummary[]
  truncated: boolean
}

export interface PointsResponse {
  from: string
  to: string
  points: TrackPoint[]
  truncated: boolean
}

export interface ApiError {
  error: string
}

export type AntitheftMode = 'armed' | 'disarmed'

export interface DeviceMode {
  device: string
  mode: AntitheftMode
  since: string | null // ISO changed_at
  lastCheckedAt: string | null // ISO last_checked_at
}

export interface ModesResponse {
  devices: DeviceMode[]
}

export interface PhoneModeResponse {
  device: string
  mode: AntitheftMode
  since: string | null
}
