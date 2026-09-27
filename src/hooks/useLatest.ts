import { useCallback, useEffect, useRef, useState } from 'react'
import type { LatestPoint } from '../../lib/shared/types.js'
import { getLatest, UnauthorizedError } from '../lib/api.js'

const REFRESH_MS = 60_000

export interface UseLatestResult {
  devices: LatestPoint[]
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useLatest(onUnauthorized: () => void): UseLatestResult {
  const [devices, setDevices] = useState<LatestPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const onUnauthorizedRef = useRef(onUnauthorized)
  onUnauthorizedRef.current = onUnauthorized

  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true)
    getLatest(signal)
      .then((res) => {
        setDevices(res.devices)
        setError(null)
      })
      .catch((err) => {
        if (err instanceof UnauthorizedError) {
          onUnauthorizedRef.current()
          return
        }
        if ((err as { name?: string }).name === 'AbortError') return
        setError('Could not load status')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)

    const interval = setInterval(() => load(), REFRESH_MS)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)

    return () => {
      controller.abort()
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [load])

  return { devices, loading, error, refresh: () => load() }
}
