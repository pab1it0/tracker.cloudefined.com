import { useEffect, useRef, useState } from 'react'
import type { SessionSummary } from '../../lib/shared/types.js'
import { ApiRequestError, getSessions, UnauthorizedError } from '../lib/api.js'

export interface UseSessionsResult {
  sessions: SessionSummary[]
  truncated: boolean
  loading: boolean
  error: string | null
  reload: () => void
}

export function useSessions(
  from: string,
  to: string,
  onUnauthorized: () => void,
): UseSessionsResult {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const onUnauthorizedRef = useRef(onUnauthorized)
  onUnauthorizedRef.current = onUnauthorized

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    getSessions(from, to, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return
        setSessions(res.sessions)
        setTruncated(res.truncated)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        if (err instanceof UnauthorizedError) {
          onUnauthorizedRef.current()
          return
        }
        setError(err instanceof ApiRequestError ? err.message : 'Could not load sessions')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [from, to, reloadToken])

  return { sessions, truncated, loading, error, reload: () => setReloadToken((t) => t + 1) }
}
