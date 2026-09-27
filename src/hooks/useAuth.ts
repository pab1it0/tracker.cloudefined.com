import { useCallback, useEffect, useState } from 'react'
import { getSession, login as apiLogin, logout as apiLogout } from '../lib/api.js'

export type AuthStatus = 'checking' | 'authenticated' | 'anonymous'

export interface AuthState {
  status: AuthStatus
  login: (password: string) => Promise<void>
  logout: () => Promise<void>
  markUnauthorized: () => void
}

export function useAuth(): AuthState {
  const [status, setStatus] = useState<AuthStatus>('checking')

  useEffect(() => {
    const controller = new AbortController()
    getSession(controller.signal)
      .then((res) => setStatus(res.authenticated ? 'authenticated' : 'anonymous'))
      .catch(() => setStatus('anonymous'))
    return () => controller.abort()
  }, [])

  const login = useCallback(async (password: string) => {
    await apiLogin(password)
    setStatus('authenticated')
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiLogout()
    } finally {
      setStatus('anonymous')
    }
  }, [])

  const markUnauthorized = useCallback(() => setStatus('anonymous'), [])

  return { status, login, logout, markUnauthorized }
}
