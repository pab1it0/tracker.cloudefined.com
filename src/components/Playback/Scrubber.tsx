import { useCallback, useMemo, useRef, useState } from 'react'
import type { TrackPoint } from '../../../lib/shared/types.js'
import { deriveSpeeds } from '../../../lib/shared/geo.js'
import { formatBattery, formatPlaybackClock } from '../../lib/format.js'

interface ScrubberProps {
  points: TrackPoint[]
  minMs: number
  maxMs: number
  cursorMs: number
  onSeek: (ms: number) => void
}

const HEIGHT = 40
const WIDTH = 100 // viewBox units, scaled by CSS width

export function Scrubber({ points, minMs, maxMs, cursorMs, onSeek }: ScrubberProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverX, setHoverX] = useState<number | null>(null)
  const span = Math.max(1, maxMs - minMs)

  const { areaPath, linePath, speeds } = useMemo(() => {
    const speeds = deriveSpeeds(points)
    const maxSpeed = Math.max(1, ...speeds.map((s) => s ?? 0))
    const coords = points.map((p, i) => {
      const x = ((new Date(p.t).getTime() - minMs) / span) * WIDTH
      const s = speeds[i] ?? 0
      const y = HEIGHT - (s / maxSpeed) * (HEIGHT - 4) - 2
      return [x, y] as [number, number]
    })
    if (coords.length === 0) return { areaPath: '', linePath: '', speeds }
    const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
    const area = `${line} L${coords[coords.length - 1]![0].toFixed(2)},${HEIGHT} L${coords[0]![0].toFixed(2)},${HEIGHT} Z`
    return { areaPath: area, linePath: line, speeds }
  }, [points, minMs, span])

  const cursorX = Math.min(WIDTH, Math.max(0, ((cursorMs - minMs) / span) * WIDTH))
  const playedClipId = 'scrubber-played-clip'

  const msFromClientX = useCallback(
    (clientX: number): number => {
      const svg = svgRef.current
      if (!svg) return cursorMs
      const rect = svg.getBoundingClientRect()
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      return minMs + ratio * span
    },
    [cursorMs, minMs, span],
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      onSeek(msFromClientX(e.clientX))
    },
    [onSeek, msFromClientX],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      setHoverX(((e.clientX - rect.left) / rect.width) * WIDTH)
      if (e.buttons === 1) onSeek(msFromClientX(e.clientX))
    },
    [onSeek, msFromClientX],
  )

  const hoverInfo = useMemo(() => {
    if (hoverX === null || points.length === 0) return null
    const ms = minMs + (hoverX / WIDTH) * span
    let idx = 0
    while (idx < points.length - 1 && new Date(points[idx]!.t).getTime() < ms) idx++
    const point = points[idx]
    if (!point) return null
    return { point, speed: speeds[idx] ?? null, x: hoverX }
  }, [hoverX, points, minMs, span, speeds])

  return (
    <div className="scrubber">
      <svg
        ref={svgRef}
        className="scrubber-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="slider"
        aria-label="Playback position"
        aria-valuemin={minMs}
        aria-valuemax={maxMs}
        aria-valuenow={cursorMs}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverX(null)}
      >
        <defs>
          <clipPath id={playedClipId}>
            <rect x="0" y="0" width={cursorX} height={HEIGHT} />
          </clipPath>
        </defs>
        <path d={areaPath} className="scrubber-area scrubber-area--muted" />
        <path d={linePath} className="scrubber-line scrubber-line--muted" />
        <g clipPath={`url(#${playedClipId})`}>
          <path d={areaPath} className="scrubber-area scrubber-area--played" />
          <path d={linePath} className="scrubber-line scrubber-line--played" />
        </g>
        <line x1={cursorX} y1={0} x2={cursorX} y2={HEIGHT} className="scrubber-handle" />
        {hoverX !== null && <line x1={hoverX} y1={0} x2={hoverX} y2={HEIGHT} className="scrubber-crosshair" />}
      </svg>

      {hoverInfo && (
        <div
          className="scrubber-tooltip glass"
          style={{ left: `${(hoverInfo.x / WIDTH) * 100}%` }}
        >
          <div className="tabular-nums">{formatPlaybackClock(hoverInfo.point.t)}</div>
          <div>
            {hoverInfo.speed !== null ? `${(hoverInfo.speed * 3.6).toFixed(1)} km/h` : '—'} ·{' '}
            {formatBattery(hoverInfo.point.bat)}
          </div>
        </div>
      )}
    </div>
  )
}
