export class ConfigError extends Error {
  constructor(public readonly varName: string, message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

export interface Env {
  mongodbUri: string
  mongodbDb: string
  mongodbCollection: string
  mongodbRoutesView: string
  trackerPassword: string
  sessionSecret: string
}

function required(name: string): string {
  const value = process.env[name]
  if (!value || value.trim() === '') {
    throw new ConfigError(name, `missing required env var ${name}`)
  }
  return value
}

/** Reads and validates server env vars. Throws ConfigError naming the offending var. */
export function readEnv(): Env {
  const sessionSecret = required('SESSION_SECRET')
  if (sessionSecret.length < 32) {
    throw new ConfigError('SESSION_SECRET', 'SESSION_SECRET must be at least 32 characters')
  }

  return {
    mongodbUri: required('MONGODB_URI'),
    mongodbDb: process.env.MONGODB_DB?.trim() || 'n8n',
    mongodbCollection: process.env.MONGODB_COLLECTION?.trim() || 'antitheft_locations',
    mongodbRoutesView: process.env.MONGODB_ROUTES_VIEW?.trim() || 'antitheft_routes',
    trackerPassword: required('TRACKER_PASSWORD'),
    sessionSecret,
  }
}
