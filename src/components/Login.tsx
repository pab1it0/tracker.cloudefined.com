import { useCallback, useRef, useState } from 'react'
import { ApiRequestError } from '../lib/api.js'
import { Mark } from './Mark.js'

interface LoginProps {
  onLogin: (password: string) => Promise<void>
}

export function Login({ onLogin }: LoginProps) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (loading || password.length === 0) return
      setLoading(true)
      setError(null)
      try {
        await onLogin(password)
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 401) {
          setError('Wrong password')
        } else if (err instanceof ApiRequestError && err.status === 429) {
          setError('Too many attempts — try again in a few minutes')
        } else {
          setError('Something went wrong — try again')
        }
        setShake(true)
        setPassword('')
        inputRef.current?.focus()
        setTimeout(() => setShake(false), 400)
      } finally {
        setLoading(false)
      }
    },
    [loading, password, onLogin],
  )

  return (
    <div className="login-screen">
      <div className="login-radar" aria-hidden="true" />
      <form
        className={`login-card glass${shake ? ' login-card--shake' : ''}`}
        onSubmit={handleSubmit}
      >
        <Mark size={40} />
        <h1 className="login-title">Tracker</h1>
        <p className="login-subtitle">Private location history</p>

        <label className="visually-hidden" htmlFor="password">
          Password
        </label>
        <input
          ref={inputRef}
          id="password"
          type="password"
          className="login-input"
          autoComplete="current-password"
          autoFocus
          value={password}
          disabled={loading}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error !== null}
          aria-describedby={error ? 'login-error' : undefined}
        />

        {error && (
          <p id="login-error" className="login-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="login-submit" disabled={loading || password.length === 0}>
          {loading ? 'Unlocking…' : 'Unlock'}
        </button>
      </form>
    </div>
  )
}
