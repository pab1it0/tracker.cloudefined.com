import { useEffect, useState } from 'react'
import type { LatestPoint } from '../../../lib/shared/types.js'
import { formatAbsolute, formatAccuracy, formatBattery, formatRelative } from '../../lib/format.js'
import { BatteryIcon, ExternalLinkIcon } from '../icons.js'

const FRESH_MS = 3 * 60_000
const TICK_MS = 15_000

interface StatusCardProps {
  device: LatestPoint | null
  loading: boolean
  error: string | null
  onCenter: () => void
}

export function StatusCard({ device, loading, error, onCenter }: StatusCardProps) {
  const [, setTick] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), TICK_MS)
    return () => clearInterval(interval)
  }, [])

  if (loading && !device) {
    return (
      <div className="status-card">
        <div className="skeleton skeleton-line" style={{ width: '60%' }} />
        <div className="skeleton skeleton-line" style={{ width: '40%' }} />
      </div>
    )
  }

  if (!device) {
    return (
      <div className="status-card status-card--empty">
        <p>{error ? 'Could not load status' : 'No devices reporting yet.'}</p>
      </div>
    )
  }

  const ageMs = Date.now() - new Date(device.receivedAt).getTime()
  const isLive = ageMs < FRESH_MS
  const mapsUrl = `https://maps.apple.com/?ll=${device.lat},${device.lon}&q=${encodeURIComponent('Last fix')}`

  return (
    <div className="status-card">
      <div className="status-card-top">
        <span className="status-device">{device.device}</span>
        <span className={`status-pill ${isLive ? 'status-pill--good' : 'status-pill--idle'}`}>
          {isLive && <span className="status-pill-dot" aria-hidden="true" />}
          {isLive ? 'Live' : 'Idle'}
        </span>
      </div>

      <p className="status-relative tabular-nums" title={formatAbsolute(device.receivedAt)}>
        Last fix {formatRelative(device.receivedAt)}
      </p>

      <div className="status-metrics">
        <span className="tabular-nums">{formatAccuracy(device.acc)}</span>
        <span className="status-battery">
          <BatteryIcon level={device.bat} />
          <span className="tabular-nums">{formatBattery(device.bat)}</span>
        </span>
      </div>

      <div className="status-actions">
        <button type="button" className="status-button" onClick={onCenter}>
          Center
        </button>
        <a
          className="status-button status-button--link"
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in Maps
          <ExternalLinkIcon />
        </a>
      </div>
    </div>
  )
}
