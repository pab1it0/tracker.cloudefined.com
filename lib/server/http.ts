import { ConfigError } from './env.js'

const BASE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}

/** JSON response with standard security/caching headers. */
export function json(data: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...BASE_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  })
}

/** JSON error response shaped as {error: message}. */
export function error(status: number, message: string, extraHeaders?: Record<string, string>): Response {
  return json({ error: message }, status, extraHeaders)
}

/** 204 No Content with standard headers. */
export function noContent(headers?: Record<string, string>): Response {
  return new Response(null, {
    status: 204,
    headers: { ...BASE_HEADERS, ...headers },
  })
}

/** Wraps a handler: ConfigError and unexpected errors become generic JSON 500s, logged server-side only. */
export function withErrors(
  handler: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    try {
      return await handler(request)
    } catch (err) {
      if (err instanceof ConfigError) {
        console.error(`server not configured: ${err.varName}`)
        return error(500, 'server not configured')
      }
      console.error(err)
      return error(500, 'internal error')
    }
  }
}
