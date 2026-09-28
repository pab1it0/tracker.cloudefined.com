import { checkPassword } from './auth.js'
import { readAntitheftToken } from './env.js'
import { error } from './http.js'
import { checkRateLimit, clearFailures, clientIp, recordFailure } from './rate-limit.js'

/**
 * Shared phone-endpoint auth: rate-limits by IP, then checks X-AntiTheft-Token.
 * Returns null on success, or the Response to return on failure. Throws ConfigError
 * (via readAntitheftToken) if the token isn't configured; the caller's withErrors wraps that.
 */
export async function authorizePhone(request: Request): Promise<Response | null> {
  const key = `mode:${clientIp(request)}`
  const retryAfterS = checkRateLimit(key)
  if (retryAfterS > 0) {
    return error(429, 'too many attempts', { 'Retry-After': String(retryAfterS) })
  }

  const expected = readAntitheftToken()

  const token = request.headers.get('x-antitheft-token') ?? ''
  if (!token || !checkPassword(token, expected)) {
    recordFailure(key)
    return error(401, 'unauthorized')
  }
  clearFailures(key)
  return null
}

export interface ReadFieldsValue {
  fields: Record<string, string>
  files: Record<string, File>
}

export type ReadFieldsResult =
  | { ok: true; value: ReadFieldsValue }
  | { ok: false; status: number; message: string }

/**
 * Reads a phone-endpoint body as JSON, form-urlencoded or multipart/form-data into
 * plain fields + files. Rejects on declared or actual size over maxBytes, and on any
 * other content type.
 */
export async function readFields(request: Request, maxBytes: number): Promise<ReadFieldsResult> {
  const contentType = request.headers.get('content-type') ?? ''

  const declaredLength = Number(request.headers.get('content-length') ?? '')
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { ok: false, status: 413, message: 'request body too large' }
  }

  const isJson = contentType.includes('application/json')
  const isUrlEncoded = contentType.includes('application/x-www-form-urlencoded')
  const isMultipart = contentType.includes('multipart/form-data')
  if (!isJson && !isUrlEncoded && !isMultipart) {
    return { ok: false, status: 400, message: 'unsupported content type' }
  }

  const buf = await request.arrayBuffer()
  if (buf.byteLength > maxBytes) {
    return { ok: false, status: 413, message: 'request body too large' }
  }

  const fields: Record<string, string> = {}
  const files: Record<string, File> = {}

  if (isJson) {
    let body: unknown
    try {
      body = JSON.parse(new TextDecoder().decode(buf))
    } catch {
      return { ok: false, status: 400, message: 'invalid JSON body' }
    }
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
        if (typeof value === 'string') fields[key] = value
        else if (typeof value === 'number' || typeof value === 'boolean') fields[key] = String(value)
      }
    }
    return { ok: true, value: { fields, files } }
  }

  if (isUrlEncoded) {
    const params = new URLSearchParams(new TextDecoder().decode(buf))
    for (const [key, value] of params) fields[key] = value
    return { ok: true, value: { fields, files } }
  }

  // multipart/form-data: reconstruct a Request so we can reuse the platform's formData() parser.
  let form: FormData
  try {
    const reconstructed = new Request('http://local/', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: buf,
    })
    form = await reconstructed.formData()
  } catch {
    return { ok: false, status: 400, message: 'invalid multipart body' }
  }
  for (const [key, value] of form.entries()) {
    if (value instanceof File) files[key] = value
    else fields[key] = value
  }
  return { ok: true, value: { fields, files } }
}

/** Strips control chars, trims, and slices to max length. Mirrors the old n8n string validator. */
export function str(v: unknown, max: number): string {
  if (typeof v !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  const cleaned = v.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return cleaned.slice(0, max)
}

/** Parses a number field, accepting a comma decimal separator. Null if empty or out of [min, max]. */
export function num(v: unknown, min: number, max: number): number | null {
  if (typeof v !== 'string') return null
  const cleaned = v.trim().replace(',', '.')
  if (cleaned === '') return null
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n < min || n > max) return null
  return n
}
