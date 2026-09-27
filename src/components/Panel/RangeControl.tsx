import { useMemo, useState } from 'react'
import {
  customRange,
  parseLocalDateTime,
  rangeForPreset,
  toDateTimeLocal,
  type Range,
  type RangePreset,
} from '../../lib/range.js'
import { POINTS_MAX_SPAN_MS } from '../../../lib/shared/rangeLimits.js'

interface RangeControlProps {
  range: Range
  onChange: (range: Range) => void
}

const PRESETS: { key: Exclude<RangePreset, 'custom'>; label: string }[] = [
  { key: '24h', label: '24h' },
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
]

export function RangeControl({ range, onChange }: RangeControlProps) {
  const [customFrom, setCustomFrom] = useState(() => toDateTimeLocal(range.from))
  const [customTo, setCustomTo] = useState(() => toDateTimeLocal(range.to))
  const [showCustom, setShowCustom] = useState(range.preset === 'custom')

  const validationError = useMemo(() => {
    const fromMs = parseLocalDateTime(customFrom)
    const toMs = parseLocalDateTime(customTo)
    if (fromMs === null || toMs === null) return 'Enter both dates'
    if (fromMs >= toMs) return 'From must be before To'
    if (toMs - fromMs > POINTS_MAX_SPAN_MS) return 'Max 31 days'
    return null
  }, [customFrom, customTo])

  return (
    <div className="range-control">
      <div className="range-segmented" role="group" aria-label="Time range">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`range-segment${range.preset === p.key ? ' range-segment--active' : ''}`}
            aria-pressed={range.preset === p.key}
            onClick={() => {
              setShowCustom(false)
              onChange(rangeForPreset(p.key))
            }}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          className={`range-segment${range.preset === 'custom' ? ' range-segment--active' : ''}`}
          aria-pressed={range.preset === 'custom'}
          onClick={() => setShowCustom((v) => !v)}
        >
          Custom
        </button>
      </div>

      {showCustom && (
        <div className="range-custom">
          <label className="range-custom-field">
            <span>From</span>
            <input
              type="datetime-local"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
          </label>
          <label className="range-custom-field">
            <span>To</span>
            <input type="datetime-local" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </label>
          <button
            type="button"
            className="range-apply"
            disabled={validationError !== null}
            onClick={() => onChange(customRange(customFrom, customTo))}
          >
            Apply
          </button>
          {validationError && <p className="range-custom-error">{validationError}</p>}
        </div>
      )}
    </div>
  )
}
