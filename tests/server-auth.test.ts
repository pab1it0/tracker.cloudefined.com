import { describe, expect, it } from 'vitest'
import {
  checkPassword,
  clearedCookie,
  isSecureRequest,
  parseCookies,
  sessionCookie,
  signSession,
  verifySession,
} from '../lib/server/auth.js'

const SECRET = 'a'.repeat(32)
const OTHER_SECRET = 'b'.repeat(32)

describe('signSession / verifySession', () => {
  it('verifies a freshly signed session', () => {
    const now = Date.now()
    const value = signSession(SECRET, now)
    expect(verifySession(value, SECRET, now)).toBe(true)
  })

  it('rejects a tampered signature', () => {
    const now = Date.now()
    const value = signSession(SECRET, now)
    const tampered = value.slice(0, -1) + (value.endsWith('A') ? 'B' : 'A')
    expect(verifySession(tampered, SECRET, now)).toBe(false)
  })

  it('rejects a tampered expiry', () => {
    const now = Date.now()
    const value = signSession(SECRET, now)
    const [version, expiresAt, sig] = value.split('.')
    const tampered = `${version}.${Number(expiresAt) + 1000}.${sig}`
    expect(verifySession(tampered, SECRET, now)).toBe(false)
  })

  it('rejects an expired session', () => {
    const now = Date.now()
    const value = signSession(SECRET, now, 1000)
    expect(verifySession(value, SECRET, now + 2000)).toBe(false)
  })

  it('rejects a session signed with a different secret', () => {
    const now = Date.now()
    const value = signSession(SECRET, now)
    expect(verifySession(value, OTHER_SECRET, now)).toBe(false)
  })

  it.each([
    'not-even-close',
    'v1.abc.sig',
    'v2.123456.sig',
    '',
    'v1.123456',
    'v1.123456.sig.extra',
  ])('rejects malformed value %s', (value) => {
    expect(verifySession(value, SECRET, Date.now())).toBe(false)
  })
})

describe('checkPassword', () => {
  it('accepts the correct password', () => {
    expect(checkPassword('correct-horse', 'correct-horse')).toBe(true)
  })

  it('rejects an incorrect password', () => {
    expect(checkPassword('wrong', 'correct-horse')).toBe(false)
  })

  it('rejects passwords of different lengths without throwing', () => {
    expect(checkPassword('short', 'a-much-longer-password-value')).toBe(false)
  })
})

describe('cookie attributes', () => {
  it('sessionCookie includes HttpOnly, SameSite=Strict, Path=/, Max-Age', () => {
    const cookie = sessionCookie('v1.123.sig', false)
    expect(cookie).toContain('tracker_session=v1.123.sig')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Strict')
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain('Max-Age=')
    expect(cookie).not.toContain('Secure')
  })

  it('sessionCookie adds Secure when secure=true', () => {
    const cookie = sessionCookie('v1.123.sig', true)
    expect(cookie).toContain('Secure')
  })

  it('clearedCookie has Max-Age=0', () => {
    expect(clearedCookie(false)).toContain('Max-Age=0')
  })
})

describe('isSecureRequest', () => {
  it('is false for http://localhost', () => {
    expect(isSecureRequest(new Request('http://localhost:5173/api/session'))).toBe(false)
  })

  it('is false for http://127.0.0.1', () => {
    expect(isSecureRequest(new Request('http://127.0.0.1:5173/api/session'))).toBe(false)
  })

  it('is true for https URLs', () => {
    expect(isSecureRequest(new Request('https://tracker.cloudefined.com/api/session'))).toBe(true)
  })

  it('is true for http on a non-localhost host', () => {
    expect(isSecureRequest(new Request('http://example.com/api/session'))).toBe(true)
  })
})

describe('parseCookies', () => {
  it('parses multiple cookies', () => {
    expect(parseCookies('a=1; b=2')).toEqual({ a: '1', b: '2' })
  })

  it('returns empty object for null header', () => {
    expect(parseCookies(null)).toEqual({})
  })

  it('decodes URI-encoded values', () => {
    expect(parseCookies('tracker_session=v1.123.abc%2Fdef')).toEqual({
      tracker_session: 'v1.123.abc/def',
    })
  })

  it('keeps the raw value instead of throwing on a malformed cookie', () => {
    expect(() => parseCookies('a=%E0%A4%A; tracker_session=v1.x.y')).not.toThrow()
    expect(parseCookies('a=%E0%A4%A; tracker_session=v1.x.y')).toEqual({
      a: '%E0%A4%A',
      tracker_session: 'v1.x.y',
    })
  })
})
