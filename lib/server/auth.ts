import { createHmac, createHash, timingSafeEqual } from 'node:crypto'
import { error } from './http.js'
import type { Env } from './env.js'

export const COOKIE_NAME = 'tracker_session'
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000

function hmac(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

/** Signs a session cookie value: v1.<expiresAtMs>.<hmac>. */
export function signSession(secret: string, now: number, ttlMs = DEFAULT_TTL_MS): string {
  const expiresAt = now + ttlMs
  const payload = `v1.${expiresAt}`
  return `${payload}.${hmac(secret, payload)}`
}

/** Verifies a session cookie value: checks signature and expiry. */
export function verifySession(value: string, secret: string, now: number): boolean {
  const parts = value.split('.')
  if (parts.length !== 3) return false
  const [version, expiresAtStr, sig] = parts as [string, string, string]
  if (version !== 'v1') return false
  if (!/^\d+$/.test(expiresAtStr)) return false

  const expected = hmac(secret, `${version}.${expiresAtStr}`)
  const expectedBuf = Buffer.from(expected)
  const actualBuf = Buffer.from(sig)
  if (expectedBuf.length !== actualBuf.length) return false
  if (!timingSafeEqual(expectedBuf, actualBuf)) return false

  const expiresAt = Number(expiresAtStr)
  return expiresAt > now
}

/** Constant-time (length-safe) comparison of a password against the expected value via SHA-256 digests. */
export function checkPassword(input: string, expected: string): boolean {
  const inputDigest = createHash('sha256').update(input).digest()
  const expectedDigest = createHash('sha256').update(expected).digest()
  return timingSafeEqual(inputDigest, expectedDigest)
}

function cookieAttrs(maxAgeS: number, secure: boolean): string {
  const parts = ['HttpOnly', 'SameSite=Strict', 'Path=/', `Max-Age=${maxAgeS}`]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function sessionCookie(value: string, secure: boolean, ttlMs = DEFAULT_TTL_MS): string {
  const maxAgeS = Math.floor(ttlMs / 1000)
  return `${COOKIE_NAME}=${value}; ${cookieAttrs(maxAgeS, secure)}`
}

export function clearedCookie(secure: boolean): string {
  return `${COOKIE_NAME}=; ${cookieAttrs(0, secure)}`
}

/** True only for http://localhost or http://127.0.0.1 (dev); everything else is treated as needing Secure. */
export function isSecureRequest(request: Request): boolean {
  const url = new URL(request.url)
  if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
    return false
  }
  return true
}

export function parseCookies(header: string | null): Record<string, string> {
  const cookies: Record<string, string> = {}
  if (!header) return cookies
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (!key) continue
    try {
      cookies[key] = decodeURIComponent(value)
    } catch {
      cookies[key] = value
    }
  }
  return cookies
}

/** Returns null when the request carries a valid session cookie, otherwise a 401 Response. */
export function requireSession(request: Request, env: Env): Response | null {
  const cookies = parseCookies(request.headers.get('cookie'))
  const value = cookies[COOKIE_NAME]
  if (!value || !verifySession(value, env.sessionSecret, Date.now())) {
    return error(401, 'unauthorized')
  }
  return null
}
