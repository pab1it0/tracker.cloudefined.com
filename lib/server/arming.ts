import { haversineM } from '../shared/geo.js'
import type { ArmReason } from '../shared/types.js'
import type { HomeConfig } from './env.js'

export interface AlertForArming {
  trigger: string
  ssid: string | null
  lat: number | null
  lon: number | null
}

function isAway(alert: AlertForArming, home: HomeConfig): boolean {
  if (alert.lat === null || alert.lon === null) return true
  if (home.lat === null || home.lon === null) return true
  const distM = haversineM([home.lon, home.lat], [alert.lon, alert.lat])
  return distM > home.radiusM
}

function isUnknownWifi(alert: AlertForArming, home: HomeConfig): boolean {
  const ssid = alert.ssid?.trim() ?? ''
  if (ssid === '') return true
  return !home.knownWifi.includes(ssid)
}

/** Pure arming decision. Nothing here ever disarms; returns null when no arm condition is met. */
export function armReason(alert: AlertForArming, home: HomeConfig): ArmReason | null {
  if (alert.trigger === 'airplane') return 'airplane'
  if (alert.trigger === 'charger' && isAway(alert, home) && isUnknownWifi(alert, home)) return 'charger'
  return null
}
