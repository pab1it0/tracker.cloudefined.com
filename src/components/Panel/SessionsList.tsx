import { useMemo } from 'react'
import type { SessionSummary } from '../../../lib/shared/types.js'
import { formatDayLabel, formatDistance, formatDuration, formatTime } from '../../lib/format.js'

export const ALL_POINTS_ID = '__all__'

interface SessionsListProps {
  sessions: SessionSummary[]
  loading: boolean
  error: string | null
  truncated: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  onRetry: () => void
  onExpandRange: () => void
}

interface DayGroup {
  label: string
  sessions: SessionSummary[]
}

function groupByDay(sessions: SessionSummary[]): DayGroup[] {
  const groups: DayGroup[] = []
  for (const session of sessions) {
    const label = formatDayLabel(session.start)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.sessions.push(session)
    else groups.push({ label, sessions: [session] })
  }
  return groups
}

function maxDuration(sessions: SessionSummary[]): number {
  return sessions.reduce((max, s) => Math.max(max, s.durationS), 1)
}

export function SessionsList({
  sessions,
  loading,
  error,
  truncated,
  selectedId,
  onSelect,
  onRetry,
  onExpandRange,
}: SessionsListProps) {
  const groups = useMemo(() => groupByDay(sessions), [sessions])
  const longest = useMemo(() => maxDuration(sessions), [sessions])

  if (loading) {
    return (
      <div className="sessions-list">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton skeleton-row" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="sessions-empty">
        <p>{error}</p>
        <button type="button" className="sessions-retry" onClick={onRetry}>
          Retry
        </button>
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="sessions-empty">
        <p>No movement in this range.</p>
        <button type="button" className="sessions-retry" onClick={onExpandRange}>
          Show 30 days
        </button>
      </div>
    )
  }

  return (
    <div className="sessions-list" role="listbox" aria-label="Sessions">
      {truncated && <p className="sessions-truncated">Some sessions were omitted — narrow the range.</p>}

      <button
        type="button"
        role="option"
        aria-selected={selectedId === ALL_POINTS_ID}
        className={`session-row session-row--all${selectedId === ALL_POINTS_ID ? ' session-row--selected' : ''}`}
        onClick={() => onSelect(ALL_POINTS_ID)}
      >
        All points in range
      </button>

      {groups.map((group) => (
        <div key={group.label} className="session-day-group">
          <h3 className="session-day-label">{group.label}</h3>
          {group.sessions.map((session) => {
            const selected = selectedId === session.id
            const width = Math.max(6, (session.durationS / longest) * 100)
            return (
              <button
                key={session.id}
                type="button"
                role="option"
                aria-selected={selected}
                className={`session-row${selected ? ' session-row--selected' : ''}`}
                onClick={() => onSelect(session.id)}
              >
                <div className="session-row-top">
                  <span className="tabular-nums">
                    {formatTime(session.start)} – {formatTime(session.end)}
                  </span>
                  <span className="session-row-duration tabular-nums">{formatDuration(session.durationS)}</span>
                </div>
                <div className="session-row-bottom">
                  <span>{formatDistance(session.distanceM)}</span>
                  <span>·</span>
                  <span>{session.points} pts</span>
                </div>
                <div className="session-activity" aria-hidden="true">
                  <span className="session-activity-bar" style={{ width: `${width}%` }} />
                </div>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
