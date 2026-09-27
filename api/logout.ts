import { withErrors, noContent } from '../lib/server/http.js'
import { clearedCookie, isSecureRequest } from '../lib/server/auth.js'

export const POST = withErrors(async (request: Request) => {
  const secure = isSecureRequest(request)
  return noContent({ 'Set-Cookie': clearedCookie(secure) })
})
