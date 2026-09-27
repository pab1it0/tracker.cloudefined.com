import type {
  ApiError,
  LatestResponse,
  PointsResponse,
  SessionsResponse,
} from '../../lib/shared/types.js'

export class UnauthorizedError extends Error {
  constructor() {
    super('unauthorized')
    this.name = 'UnauthorizedError'
  }
}

export class ApiRequestError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...init?.headers },
  })

  if (response.status === 401) throw new UnauthorizedError()

  if (!response.ok) {
    let message = `request failed (${response.status})`
    try {
      const body = (await response.json()) as ApiError
      if (body.error) message = body.error
    } catch {
      // ignore parse failure, keep default message
    }
    throw new ApiRequestError(response.status, message)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export function login(password: string, signal?: AbortSignal): Promise<void> {
  return request('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
    signal,
  })
}

export function logout(signal?: AbortSignal): Promise<void> {
  return request('/api/logout', { method: 'POST', signal })
}

export function getSession(signal?: AbortSignal): Promise<{ authenticated: boolean }> {
  return request('/api/session', { signal })
}

export function getLatest(signal?: AbortSignal): Promise<LatestResponse> {
  return request('/api/latest', { signal })
}

export function getSessions(
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<SessionsResponse> {
  const params = new URLSearchParams({ from, to })
  return request(`/api/sessions?${params}`, { signal })
}

export function getPoints(
  params: { from: string; to: string; device?: string; session?: string },
  signal?: AbortSignal,
): Promise<PointsResponse> {
  const search = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
  return request(`/api/points?${search}`, { signal })
}
