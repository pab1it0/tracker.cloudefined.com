import type { TrackPoint } from '../../../lib/shared/types.js'
import { formatAccuracy, formatBattery, formatDateTime, formatKmh } from '../../lib/format.js'

export interface HoverInfo {
  point: TrackPoint & { speedMps?: number | null }
  x: number
  y: number
}

interface HoverTooltipProps {
  info: HoverInfo
}

export function HoverTooltip({ info }: HoverTooltipProps) {
  const { point, x, y } = info
  const flipX = x > (typeof window !== 'undefined' ? window.innerWidth - 220 : 0)
  const flipY = y > (typeof window !== 'undefined' ? window.innerHeight - 160 : 0)

  return (
    <div
      className="map-tooltip glass"
      style={{
        left: flipX ? undefined : x + 14,
        right: flipX ? (typeof window !== 'undefined' ? window.innerWidth - x + 14 : undefined) : undefined,
        top: flipY ? undefined : y + 14,
        bottom: flipY ? (typeof window !== 'undefined' ? window.innerHeight - y + 14 : undefined) : undefined,
      }}
      role="tooltip"
    >
      <div className="map-tooltip-time tabular-nums">{formatDateTime(point.t)}</div>
      <div className="map-tooltip-row">
        <span>{formatKmh(point.speedMps ?? point.spd)}</span>
        <span>{formatBattery(point.bat)}</span>
        <span>{formatAccuracy(point.acc)}</span>
      </div>
    </div>
  )
}
