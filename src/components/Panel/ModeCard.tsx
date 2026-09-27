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
}

export function ModeCard({ devices, loading, error, pendingDevices, actionErrors, onToggle }: ModeCardProps) {
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
}

function ModeRow({ device, pending, error, onToggle }: ModeRowProps) {
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

  const sinceLabel = device.since ? `since ${formatRelative(device.since)}` : 'never changed'
  const checkedLabel = device.lastCheckedAt
    ? `phone checked ${formatRelative(device.lastCheckedAt)}`
    : 'phone never checked'

  let buttonLabel = armed ? 'Disarm' : 'Arm'
  if (pending) buttonLabel = 'Saving…'
  else if (confirming) buttonLabel = armed ? 'Tap again to disarm' : 'Tap again to arm'

  return (
    <div className="mode-row">
      <div className="mode-row-top">
        <span className="mode-device">{device.device}</span>
        <span className={`status-pill ${armed ? 'status-pill--danger' : 'status-pill--idle'}`}>
          {armed ? 'Armed' : 'Disarmed'}
        </span>
      </div>
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
