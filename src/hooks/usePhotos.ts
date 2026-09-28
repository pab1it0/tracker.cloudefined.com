import { useEffect, useRef, useState } from 'react'
import type { PhotoMeta } from '../../lib/shared/types.js'
import { ApiRequestError, getPhotos, UnauthorizedError } from '../lib/api.js'

const LIVE_REFRESH_MS = 60_000

export interface UsePhotosResult {
  photos: PhotoMeta[]
  truncated: boolean
  loading: boolean
  error: string | null
  reload: () => void
}

export function usePhotos(
  from: string,
  to: string,
  isLive: boolean,
  onUnauthorized: () => void,
): UsePhotosResult {
  const [photos, setPhotos] = useState<PhotoMeta[]>([])
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
    getPhotos(from, to, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return
        setPhotos(res.photos)
        setTruncated(res.truncated)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        if (err instanceof UnauthorizedError) {
          onUnauthorizedRef.current()
          return
        }
        if ((err as { name?: string }).name === 'AbortError') return
        setError(err instanceof ApiRequestError ? err.message : 'Could not load photos')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [from, to, reloadToken])

  useEffect(() => {
    if (!isLive) return
    const interval = setInterval(() => setReloadToken((t) => t + 1), LIVE_REFRESH_MS)
    return () => clearInterval(interval)
  }, [isLive])

  return { photos, truncated, loading, error, reload: () => setReloadToken((t) => t + 1) }
}
