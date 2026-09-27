import { useEffect, useRef, useState } from 'react'
import type { TrackPoint } from '../../lib/shared/types.js'
import { ApiRequestError, getPoints, UnauthorizedError } from '../lib/api.js'

export type PointsSelection =
  | { kind: 'range'; from: string; to: string }
  | { kind: 'session'; device: string; session: string | null; from: string; to: string }

export interface UsePointsResult {
  points: TrackPoint[]
  truncated: boolean
  loading: boolean
  error: string | null
  reload: () => void
}

/** Identity of a selection, excluding `to` so routine end-of-range refreshes don't look like a switch. */
function selectionKey(selection: PointsSelection): string {
  return selection.kind === 'range'
    ? `range|${selection.from}`
    : `session|${selection.device}|${selection.session ?? ''}|${selection.from}`
}

export function usePoints(
  selection: PointsSelection | null,
  isLive: boolean,
  onUnauthorized: () => void,
): UsePointsResult {
  const [points, setPoints] = useState<TrackPoint[]>([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const onUnauthorizedRef = useRef(onUnauthorized)
  onUnauthorizedRef.current = onUnauthorized
  const lastKeyRef = useRef<string | null>(null)

  const key = selection ? selectionKey(selection) : null

  useEffect(() => {
    if (!selection) {
      setPoints([])
      setTruncated(false)
      lastKeyRef.current = null
      return
    }
    const controller = new AbortController()
    // Only a genuine identity switch resets points/shows the loading skeleton;
    // a routine refresh (same session/range, newer `to`) keeps old points visible.
    const isNewSelection = key !== lastKeyRef.current
    lastKeyRef.current = key
    if (isNewSelection) {
      setPoints([])
      setTruncated(false)
    }
    setLoading(isNewSelection)
    setError(null)

    // While live, always ask for up-to-the-second data instead of the (possibly stale) selection.to.
    const to = isLive ? new Date().toISOString() : selection.to
    const params =
      selection.kind === 'range'
        ? { from: selection.from, to }
        : {
            from: selection.from,
            to,
            device: selection.device,
            ...(selection.session !== null ? { session: selection.session } : {}),
          }

    getPoints(params, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return
        setPoints(res.points)
        setTruncated(res.truncated)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        if (err instanceof UnauthorizedError) {
          onUnauthorizedRef.current()
          return
        }
        setError(err instanceof ApiRequestError ? err.message : 'Could not load points')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, selection?.to, isLive, reloadToken])

  return { points, truncated, loading, error, reload: () => setReloadToken((t) => t + 1) }
}
