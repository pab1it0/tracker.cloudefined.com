import { memo, useEffect, useMemo, useRef } from 'react'
import type { TrackPoint } from '../../lib/shared/types.js'
import { deriveSpeeds } from '../../lib/shared/geo.js'
import { formatAccuracy, formatBattery, formatDateTime } from '../lib/format.js'

const MAX_ROWS = 2000

interface PointsTableProps {
  open: boolean
  points: TrackPoint[]
  onClose: () => void
  triggerRef: React.RefObject<HTMLElement | null>
}

function PointsTableImpl({ open, points, onClose, triggerRef }: PointsTableProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const onCancel = (e: Event) => {
      e.preventDefault()
      onClose()
    }
    const onClose_ = () => {
      onClose()
      triggerRef.current?.focus()
    }
    dialog.addEventListener('cancel', onCancel)
    dialog.addEventListener('close', onClose_)
    return () => {
      dialog.removeEventListener('cancel', onCancel)
      dialog.removeEventListener('close', onClose_)
    }
  }, [onClose, triggerRef])

  const rows = useMemo(() => points.slice(0, MAX_ROWS), [points])
  const speeds = useMemo(() => deriveSpeeds(points), [points])

  return (
    <dialog ref={dialogRef} className="points-dialog" aria-label="Points table">
      {open && (
        <>
          <div className="points-dialog-header">
            <h2>Points</h2>
            <button
              type="button"
              className="icon-button"
              aria-label="Close"
              onClick={() => dialogRef.current?.close()}
            >
              ✕
            </button>
          </div>
          {points.length > MAX_ROWS && (
            <p className="points-dialog-note">Showing first {MAX_ROWS} of {points.length} points.</p>
          )}
          <div className="points-table-wrap scrollable">
            <table className="points-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Latitude</th>
                  <th>Longitude</th>
                  <th>Accuracy</th>
                  <th>Speed</th>
                  <th>Battery</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p, i) => (
                  <tr key={`${p.t}-${i}`}>
                    <td className="tabular-nums">{formatDateTime(p.t)}</td>
                    <td className="tabular-nums">{p.lat.toFixed(5)}</td>
                    <td className="tabular-nums">{p.lon.toFixed(5)}</td>
                    <td className="tabular-nums">{formatAccuracy(p.acc)}</td>
                    <td className="tabular-nums">
                      {speeds[i] !== null && speeds[i] !== undefined ? `${(speeds[i]! * 3.6).toFixed(1)} km/h` : '—'}
                    </td>
                    <td className="tabular-nums">{formatBattery(p.bat)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </dialog>
  )
}

export const PointsTable = memo(PointsTableImpl)
