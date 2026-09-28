import { useEffect, useRef, useState } from 'react'
import type { AntitheftMode, DeviceMode } from '../../../lib/shared/types.js'
import { formatAbsolute, formatRelative } from '../../lib/format.js'

const TICK_MS = 15_000
const CONFIRM_MS = 4_000

interface ModeCardProps {
  devices: DeviceMode[]
  loading: boolean
  error: string | null
  pendingDevices: Set<string>
  actionErrors: Record<string, string>
  onToggle: (device: string, mode: AntitheftMode) => void
  primaryDevice?: string | null
}

export function ModeCard({
  devices,
  loading,
  error,
  pendingDevices,
  actionErrors,
  onToggle,
  primaryDevice,
}: ModeCardProps) {
  const [, setTick] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), TICK_MS)
    return () => clearInterval(interval)
  }, [])

  if (loading && devices.length === 0) {
    return (
      <div className="mode-card">
        <h2>Anti-theft</h2>
        <div className="skeleton skeleton-row" />
      </div>
    )
  }

  if (devices.length === 0) {
    return (
      <div className="mode-card">
        <h2>Anti-theft</h2>
        <p className="mode-card-empty">{error ? 'Could not load anti-theft mode' : 'No devices have checked in yet.'}</p>
      </div>
    )
  }

  const soloMatch = devices.length === 1 && devices[0].device === primaryDevice
  const soloDevice = soloMatch ? devices[0] : null

  if (soloDevice) {
    return (
      <div className="mode-card">
        <div className="mode-card-top">
          <h2>Anti-theft</h2>
          <span className={`status-pill ${soloDevice.mode === 'armed' ? 'status-pill--danger' : 'status-pill--idle'}`}>
            {soloDevice.mode === 'armed' ? 'Armed' : 'Disarmed'}
          </span>
        </div>
        {error && <p className="mode-card-empty">Could not load anti-theft mode</p>}
        <div className="mode-rows">
          <ModeRow
            key={soloDevice.device}
            device={soloDevice}
            pending={pendingDevices.has(soloDevice.device)}
            error={actionErrors[soloDevice.device] ?? null}
            onToggle={onToggle}
            showName={false}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="mode-card">
      <h2>Anti-theft</h2>
      {error && <p className="mode-card-empty">Could not load anti-theft mode</p>}
      <div className="mode-rows">
        {devices.map((d) => (
          <ModeRow
            key={d.device}
            device={d}
            pending={pendingDevices.has(d.device)}
            error={actionErrors[d.device] ?? null}
            onToggle={onToggle}
            showName
          />
        ))}
      </div>
    </div>
  )
}

interface ModeRowProps {
  device: DeviceMode
  pending: boolean
  error: string | null
  onToggle: (device: string, mode: AntitheftMode) => void
  showName: boolean
}

function ModeRow({ device, pending, error, onToggle, showName }: ModeRowProps) {
  const [confirming, setConfirming] = useState(false)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
    }
  }, [])

  const armed = device.mode === 'armed'
  const nextMode: AntitheftMode = armed ? 'disarmed' : 'armed'

  const handleClick = () => {
    if (confirming) {
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
      setConfirming(false)
      onToggle(device.device, nextMode)
      return
    }
    setConfirming(true)
    confirmTimer.current = setTimeout(() => setConfirming(false), CONFIRM_MS)
  }

  const sinceLabel = device.since
    ? device.changedBy === 'airplane' || device.changedBy === 'charger'
      ? `armed by ${device.changedBy} · ${formatRelative(device.since)}`
      : `since ${formatRelative(device.since)}`
    : 'never changed'
  const checkedLabel = device.lastCheckedAt
    ? `phone checked ${formatRelative(device.lastCheckedAt)}`
    : 'phone never checked'

  let buttonLabel = armed ? 'Disarm' : 'Arm'
  if (pending) buttonLabel = 'Saving…'
  else if (confirming) buttonLabel = armed ? 'Tap again to disarm' : 'Tap again to arm'

  return (
    <div className="mode-row">
      {showName && (
        <div className="mode-row-top">
          <span className="mode-device">{device.device}</span>
          <span className={`status-pill ${armed ? 'status-pill--danger' : 'status-pill--idle'}`}>
            {armed ? 'Armed' : 'Disarmed'}
          </span>
        </div>
      )}
      <p className="mode-row-meta" aria-live="polite">
        <span title={device.since ? formatAbsolute(device.since) : undefined}>{sinceLabel}</span>
        {' · '}
        <span title={device.lastCheckedAt ? formatAbsolute(device.lastCheckedAt) : undefined}>
          {checkedLabel}
        </span>
      </p>
      <button
        type="button"
        className={`status-button mode-button${confirming && armed ? ' mode-button--danger' : ''}`}
        disabled={pending}
        onClick={handleClick}
      >
        {buttonLabel}
      </button>
      {error && (
        <p className="mode-card-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
