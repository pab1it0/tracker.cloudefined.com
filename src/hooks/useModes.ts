import { useCallback, useEffect, useRef, useState } from 'react'
import type { AntitheftMode, DeviceMode } from '../../lib/shared/types.js'
import { ApiRequestError, getModes, setMode as setModeRequest, UnauthorizedError } from '../lib/api.js'

const REFRESH_MS = 60_000

export interface UseModesResult {
  devices: DeviceMode[]
  loading: boolean
  error: string | null
  pendingDevices: Set<string>
  actionErrors: Record<string, string>
  toggle: (device: string, mode: AntitheftMode) => void
}

export function useModes(onUnauthorized: () => void): UseModesResult {
  const [devices, setDevices] = useState<DeviceMode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingDevices, setPendingDevices] = useState<Set<string>>(() => new Set())
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({})
  const onUnauthorizedRef = useRef(onUnauthorized)
  onUnauthorizedRef.current = onUnauthorized
  // Devices with a toggle in flight; load() skips those rows so it can't stomp on the optimistic update.
  const pendingDevicesRef = useRef<Set<string>>(new Set())

  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true)
    getModes(signal)
      .then((res) => {
        setDevices((prev) => {
          const prevByDevice = new Map(prev.map((d) => [d.device, d]))
          return res.devices.map((d) =>
            pendingDevicesRef.current.has(d.device) ? (prevByDevice.get(d.device) ?? d) : d,
          )
        })
        setError(null)
      })
      .catch((err) => {
        if (err instanceof UnauthorizedError) {
          onUnauthorizedRef.current()
          return
        }
        if ((err as { name?: string }).name === 'AbortError') return
        setError('Could not load anti-theft mode')
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

  const toggle = useCallback((device: string, mode: AntitheftMode) => {
    pendingDevicesRef.current.add(device)
    setPendingDevices(new Set(pendingDevicesRef.current))
    setActionErrors((prev) => {
      if (!(device in prev)) return prev
      const next = { ...prev }
      delete next[device]
      return next
    })
    setModeRequest(device, mode)
      .then((updated) => {
        setDevices((prev) => prev.map((d) => (d.device === device ? updated : d)))
      })
      .catch((err) => {
        if (err instanceof UnauthorizedError) {
          onUnauthorizedRef.current()
          return
        }
        if (err instanceof ApiRequestError && err.status === 404) {
          setActionErrors((prev) => ({ ...prev, [device]: err.message }))
          return
        }
        setActionErrors((prev) => ({ ...prev, [device]: mode === 'armed' ? 'Could not arm' : 'Could not disarm' }))
      })
      .finally(() => {
        pendingDevicesRef.current.delete(device)
        setPendingDevices(new Set(pendingDevicesRef.current))
      })
  }, [])

  return { devices, loading, error, pendingDevices, actionErrors, toggle }
}
