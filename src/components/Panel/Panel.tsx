import { useRef, useState } from 'react'
import type { LatestPoint, SessionSummary } from '../../../lib/shared/types.js'
import type { Range } from '../../lib/range.js'
import type { ThemeState } from '../../hooks/useTheme.js'
import { Mark } from '../Mark.js'
import { LogoutIcon, MoonIcon, SunIcon, SystemIcon, TableIcon, ChevronIcon } from '../icons.js'
import { StatusCard } from './StatusCard.js'
import { RangeControl } from './RangeControl.js'
import { SessionsList } from './SessionsList.js'

interface PanelProps {
  device: LatestPoint | null
  statusLoading: boolean
  statusError: string | null
  onCenter: () => void
  theme: ThemeState
  onLogout: () => void
  range: Range
  onRangeChange: (range: Range) => void
  sessions: SessionSummary[]
  sessionsLoading: boolean
  sessionsError: string | null
  sessionsTruncated: boolean
  selectedId: string | null
  onSelectSession: (id: string) => void
  onRetrySessions: () => void
  onExpandRange: () => void
  onOpenTable: () => void
  tableTriggerRef: React.RefObject<HTMLButtonElement | null>
  isCompact: boolean
  selectedSummaryLabel: string | null
}

const THEME_ICON = { system: SystemIcon, light: SunIcon, dark: MoonIcon }
const THEME_LABEL = { system: 'System theme', light: 'Light theme', dark: 'Dark theme' }

export function Panel(props: PanelProps) {
  const {
    device,
    statusLoading,
    statusError,
    onCenter,
    theme,
    onLogout,
    range,
    onRangeChange,
    sessions,
    sessionsLoading,
    sessionsError,
    sessionsTruncated,
    selectedId,
    onSelectSession,
    onRetrySessions,
    onExpandRange,
    onOpenTable,
    tableTriggerRef,
    isCompact,
    selectedSummaryLabel,
  } = props

  const [sheetExpanded, setSheetExpanded] = useState(false)
  const ThemeIcon = THEME_ICON[theme.preference]

  const body = (
    <>
      <StatusCard device={device} loading={statusLoading} error={statusError} onCenter={onCenter} />
      <RangeControl range={range} onChange={onRangeChange} />
      <div className="panel-sessions-header">
        <h2>Sessions</h2>
        <button
          ref={tableTriggerRef}
          type="button"
          className="icon-button"
          aria-label="Open points table"
          title="Table"
          onClick={onOpenTable}
        >
          <TableIcon />
        </button>
      </div>
      <SessionsList
        sessions={sessions}
        loading={sessionsLoading}
        error={sessionsError}
        truncated={sessionsTruncated}
        selectedId={selectedId}
        onSelect={onSelectSession}
        onRetry={onRetrySessions}
        onExpandRange={onExpandRange}
      />
    </>
  )

  const header = (
    <div className="panel-header">
      <div className="panel-brand">
        <Mark size={22} />
        <span>Tracker</span>
      </div>
      <div className="panel-header-actions">
        <button
          type="button"
          className="icon-button"
          aria-label={THEME_LABEL[theme.preference]}
          title={THEME_LABEL[theme.preference]}
          onClick={theme.cycle}
        >
          <ThemeIcon />
        </button>
        <button type="button" className="icon-button" aria-label="Log out" title="Log out" onClick={onLogout}>
          <LogoutIcon />
        </button>
      </div>
    </div>
  )

  if (!isCompact) {
    return (
      <div className="panel panel--desktop glass">
        {header}
        <div className="panel-body scrollable">{body}</div>
      </div>
    )
  }

  return (
    <div className={`panel panel--sheet glass${sheetExpanded ? ' panel--sheet-expanded' : ''}`}>
      <button
        type="button"
        className="sheet-handle"
        aria-expanded={sheetExpanded}
        aria-label={sheetExpanded ? 'Collapse panel' : 'Expand panel'}
        onClick={() => setSheetExpanded((v) => !v)}
      >
        <span className="sheet-handle-bar" aria-hidden="true" />
        <span className="sheet-handle-summary">
          {selectedSummaryLabel ?? (device ? device.device : 'Tracker')}
        </span>
        <ChevronIcon direction={sheetExpanded ? 'down' : 'up'} />
      </button>
      {sheetExpanded && (
        <div className="panel-body scrollable">
          {header}
          {body}
        </div>
      )}
    </div>
  )
}
