import { describe, expect, it } from 'vitest'
import { armReason } from '../lib/server/arming.js'
import type { HomeConfig } from '../lib/server/env.js'

const HOME: HomeConfig = { lat: 32.0524, lon: 34.7519, radiusM: 200, knownWifi: ['DemoHomeWiFi'] }
const NO_HOME: HomeConfig = { lat: null, lon: null, radiusM: 200, knownWifi: ['DemoHomeWiFi'] }

// ~2km east of HOME, well outside a 200m radius.
const AWAY = { lat: 32.0524, lon: 34.77 }

describe('armReason', () => {
  it('airplane always arms', () => {
    expect(armReason({ trigger: 'airplane', ssid: null, lat: null, lon: null }, HOME)).toBe('airplane')
    expect(armReason({ trigger: 'airplane', ssid: 'DemoHomeWiFi', lat: HOME.lat, lon: HOME.lon }, HOME)).toBe(
      'airplane',
    )
  })

  it('charger at home on known Wi-Fi does not arm', () => {
    expect(armReason({ trigger: 'charger', ssid: 'DemoHomeWiFi', lat: HOME.lat, lon: HOME.lon }, HOME)).toBeNull()
  })

  it('charger at home on unknown Wi-Fi does not arm', () => {
    expect(armReason({ trigger: 'charger', ssid: 'CoffeeShop', lat: HOME.lat, lon: HOME.lon }, HOME)).toBeNull()
  })

  it('charger away on known Wi-Fi does not arm', () => {
    expect(armReason({ trigger: 'charger', ssid: 'DemoHomeWiFi', lat: AWAY.lat, lon: AWAY.lon }, HOME)).toBeNull()
  })

  it('charger away on unknown Wi-Fi arms', () => {
    expect(armReason({ trigger: 'charger', ssid: 'CoffeeShop', lat: AWAY.lat, lon: AWAY.lon }, HOME)).toBe('charger')
  })

  it('no location counts as away, so unknown Wi-Fi arms', () => {
    expect(armReason({ trigger: 'charger', ssid: 'CoffeeShop', lat: null, lon: null }, HOME)).toBe('charger')
  })

  it('no location with known Wi-Fi does not arm', () => {
    expect(armReason({ trigger: 'charger', ssid: 'DemoHomeWiFi', lat: null, lon: null }, HOME)).toBeNull()
  })

  it('home unset counts as away', () => {
    expect(armReason({ trigger: 'charger', ssid: 'CoffeeShop', lat: 32.0524, lon: 34.7519 }, NO_HOME)).toBe('charger')
  })

  it('empty ssid counts as unknown Wi-Fi', () => {
    expect(armReason({ trigger: 'charger', ssid: '', lat: AWAY.lat, lon: AWAY.lon }, HOME)).toBe('charger')
  })

  it('battery, heartbeat and manual never arm', () => {
    expect(armReason({ trigger: 'battery', ssid: null, lat: AWAY.lat, lon: AWAY.lon }, HOME)).toBeNull()
    expect(armReason({ trigger: 'heartbeat', ssid: null, lat: AWAY.lat, lon: AWAY.lon }, HOME)).toBeNull()
    expect(armReason({ trigger: 'manual', ssid: null, lat: AWAY.lat, lon: AWAY.lon }, HOME)).toBeNull()
  })
})
