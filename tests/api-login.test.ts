import { beforeAll, describe, expect, it } from 'vitest'

beforeAll(() => {
  process.env.TRACKER_PASSWORD = 'correct-horse-battery-staple'
  process.env.SESSION_SECRET = 'a'.repeat(32)
})

async function postLogin(password: string, ip: string): Promise<Response> {
  const { POST } = await import('../api/login.js')
  const request = new Request('http://localhost/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ password }),
  })
  return POST(request)
}

describe('POST /api/login rate limiting', () => {
  it('limits concurrent wrong-password bursts to 5 successes and 429s the rest', async () => {
    const ip = `burst-${Math.random()}`
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => postLogin('wrong-password', ip)),
    )
    const statuses = responses.map((r) => r.status)
    const unauthorized = statuses.filter((s) => s === 401).length
    const limited = statuses.filter((s) => s === 429).length

    expect(unauthorized).toBeLessThanOrEqual(5)
    expect(limited).toBeGreaterThan(0)
    expect(unauthorized + limited).toBe(10)
  })
})
