import { readEnv } from '../lib/server/env.js'
import { withErrors, json } from '../lib/server/http.js'
import { COOKIE_NAME, parseCookies, verifySession } from '../lib/server/auth.js'

export const GET = withErrors(async (request: Request) => {
  const env = readEnv()
  const cookies = parseCookies(request.headers.get('cookie'))
  const value = cookies[COOKIE_NAME]
  const authenticated = value !== undefined && verifySession(value, env.sessionSecret, Date.now())
  return json({ authenticated })
})
