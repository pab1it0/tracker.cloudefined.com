import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SessionSummary } from '../../lib/shared/types.js'
import { useLatest } from '../hooks/useLatest.js'
import { useSessions } from '../hooks/useSessions.js'
import { usePoints, type PointsSelection } from '../hooks/usePoints.js'
import { usePlayback } from '../hooks/usePlayback.js'
import { usePlaybackKeys } from '../hooks/usePlaybackKeys.js'
import { useIsCompact } from '../hooks/useMediaQuery.js'
import type { ThemeState } from '../hooks/useTheme.js'
import { rangeForPreset, type Range } from '../lib/range.js'
import { POINTS_MAX_SPAN_MS } from '../../lib/shared/rangeLimits.js'
import { MapView, type MapViewHandle } from './Map/MapView.js'
import { Panel } from './Panel/Panel.js'
import { ALL_POINTS_ID } from './Panel/SessionsList.js'
import { PlaybackBar } from './Playback/PlaybackBar.js'
import { PointsTable } from './PointsTable.js'

interface TrackerProps {
  theme: ThemeState
  onLogout: () => void
  onUnauthorized: () => void
}

const DESKTOP_PANEL_WIDTH = 360
const PANEL_INSET = 16
const LIVE_REFRESH_MS = 60_000

function selectionFor(
  id: string | null,
  sessions: SessionSummary[],
  range: Range,
): PointsSelection | null {
  if (id === null) return null
  if (id === ALL_POINTS_ID) return { kind: 'range', from: range.from, to: range.to }
  const session = sessions.find((s) => s.id === id)
  if (!session) return null

  // Use the session's own bounds, not the list range, so its route isn't clipped.
  // +1ms keeps a one-point session (start == end) valid against `from < to`.
  // (usePoints overrides `to` with "now" while the session is live, see isLive below.)
  const toMs = new Date(session.end).getTime() + 1
  // Safety net: clamp to the /api/points max span in case a session ever runs longer.
  const fromMs = Math.max(new Date(session.start).getTime(), toMs - POINTS_MAX_SPAN_MS)

  return {
    kind: 'session',
    device: session.device,
    session: session.session,
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
  }
}

export function Tracker({ theme, onLogout, onUnauthorized }: TrackerProps) {
  const isCompact = useIsCompact()
  const [range, setRange] = useState<Range>(() => rangeForPreset('7d'))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [fitToken, setFitToken] = useState(0)
  const [tableOpen, setTableOpen] = useState(false)
  const mapHandleRef = useRef<MapViewHandle | null>(null)
  const tableTriggerRef = useRef<HTMLButtonElement>(null)
  const autoSelectedRef = useRef(false)
  const isAutoRefreshRef = useRef(false)

  const { devices, loading: statusLoading, error: statusError } = useLatest(onUnauthorized)
  const {
    sessions,
    truncated: sessionsTruncated,
    loading: sessionsLoading,
    error: sessionsError,
    reload: reloadSessions,
  } = useSessions(range.from, range.to, onUnauthorized)

  useEffect(() => {
    // Skip the reset for periodic auto-refresh ticks (same preset, fresher `to`),
    // so the user's current selection survives them; only an explicit range
    // change (preset switch or Apply) should re-run auto-select.
    if (isAutoRefreshRef.current) {
      isAutoRefreshRef.current = false
      return
    }
    autoSelectedRef.current = false
  }, [range.from, range.to])

  useEffect(() => {
    if (autoSelectedRef.current || sessionsLoading) return
    if (sessions.length > 0) {
      setSelectedId(sessions[0]!.id)
      autoSelectedRef.current = true
    }
  }, [sessions, sessionsLoading])

  // Keep the newest session/points live: for a non-custom preset, recompute a fresh
  // `to` periodically so /api/sessions and /api/points both see new data.
  useEffect(() => {
    if (range.preset === 'custom') return
    const preset = range.preset
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      isAutoRefreshRef.current = true
      setRange(rangeForPreset(preset))
    }, LIVE_REFRESH_MS)
    return () => clearInterval(interval)
  }, [range.preset])

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedId) ?? null,
    [sessions, selectedId],
  )

  const selection = useMemo(
    () => selectionFor(selectedId, sessions, range),
    [selectedId, sessions, range],
  )

  const isNewestSession = selectedSession !== null && sessions[0]?.id === selectedSession.id
  const lastPointFreshEnough =
    isNewestSession && Date.now() - new Date(selectedSession.end).getTime() < 3 * 60_000
  const isLive = selection?.kind === 'session' && lastPointFreshEnough

  const {
    points,
    truncated: pointsTruncated,
    loading: pointsLoading,
    error: pointsError,
    reload: reloadPoints,
  } = usePoints(selection, isLive, onUnauthorized)

  const playback = usePlayback(points)
  usePlaybackKeys(playback)

  const latestDevice = devices[0] ?? null

  const fitPadding = useMemo(() => {
    if (isCompact) return { top: 24, bottom: 260, left: 24, right: 24 }
    return { top: PANEL_INSET + 24, bottom: PANEL_INSET + 24, left: DESKTOP_PANEL_WIDTH + PANEL_INSET + 24, right: 24 }
  }, [isCompact])

  useEffect(() => {
    if (selectedSession) setFitToken((t) => t + 1)
  }, [selectedSession?.id])

  useEffect(() => {
    if (playback.follow && playback.playing && playback.headPosition && mapHandleRef.current) {
      mapHandleRef.current.panInstant(playback.headPosition)
    }
  }, [playback.headPosition, playback.follow, playback.playing])

  const handleCenter = useCallback(() => {
    if (latestDevice) mapHandleRef.current?.jumpTo([latestDevice.lon, latestDevice.lat], 15)
  }, [latestDevice])

  const handleExpandRange = useCallback(() => setRange(rangeForPreset('30d')), [])
  const handleOpenTable = useCallback(() => setTableOpen(true), [])
  const handleCloseTable = useCallback(() => setTableOpen(false), [])

  const cursorIso = useMemo(() => new Date(playback.cursorMs).toISOString(), [playback.cursorMs])

  const selectedSummaryLabel = selectedSession
    ? `${selectedSession.points} pts · ${new Date(selectedSession.start).toLocaleTimeString()}`
    : null

  return (
    <div className="tracker">
      <MapView
        theme={theme.resolved}
        points={points}
        playedPoints={playback.playedPoints}
        headPosition={playback.headPosition}
        latest={latestDevice}
        fitBbox={selectedSession?.bbox ?? null}
        fitPadding={fitPadding}
        fitToken={fitToken}
        onMapReady={(handle) => {
          mapHandleRef.current = handle
        }}
      />

      <Panel
        device={latestDevice}
        statusLoading={statusLoading}
        statusError={statusError}
        onCenter={handleCenter}
        theme={theme}
        onLogout={onLogout}
        range={range}
        onRangeChange={setRange}
        sessions={sessions}
        sessionsLoading={sessionsLoading}
        sessionsError={sessionsError}
        sessionsTruncated={sessionsTruncated}
        selectedId={selectedId}
        onSelectSession={setSelectedId}
        onRetrySessions={reloadSessions}
        onExpandRange={handleExpandRange}
        onOpenTable={handleOpenTable}
        tableTriggerRef={tableTriggerRef}
        isCompact={isCompact}
        selectedSummaryLabel={selectedSummaryLabel}
      />

      {!pointsLoading && points.length > 1 && (
        <PlaybackBar points={points} playback={playback} cursorIso={cursorIso} />
      )}

      <PointsTable
        open={tableOpen}
        points={points}
        onClose={handleCloseTable}
        triggerRef={tableTriggerRef}
      />

      {pointsTruncated && (
        <div className="points-truncated-toast">Showing the latest 20,000 points; older points omitted.</div>
      )}

      {pointsError && (
        <div className="points-truncated-toast">
          {pointsError} <button type="button" onClick={reloadPoints}>Retry</button>
        </div>
      )}
    </div>
  )
}
