import { useCallback } from 'react'
import { useAuth } from './hooks/useAuth.js'
import { useTheme } from './hooks/useTheme.js'
import { Login } from './components/Login.js'
import { Tracker } from './components/Tracker.js'

export function App() {
  const auth = useAuth()
  const theme = useTheme()

  const handleLogin = useCallback((password: string) => auth.login(password), [auth])
  const handleLogout = useCallback(() => {
    void auth.logout()
  }, [auth])

  if (auth.status === 'checking') {
    return <div className="app-loading" aria-hidden="true" />
  }

  if (auth.status === 'anonymous') {
    return <Login onLogin={handleLogin} />
  }

  return <Tracker theme={theme} onLogout={handleLogout} onUnauthorized={auth.markUnauthorized} />
}
