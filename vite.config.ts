import { loadEnv, type Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const API_NAME_RE = /^[a-z][a-z-]{0,30}$/
const MAX_BODY_BYTES = 1024 * 1024

const SERVER_ENV_KEYS = [
  'MONGODB_URI',
  'MONGODB_DB',
  'MONGODB_COLLECTION',
  'MONGODB_ROUTES_VIEW',
  'MONGODB_MODES_COLLECTION',
  'TRACKER_PASSWORD',
  'SESSION_SECRET',
  'ANTITHEFT_TOKEN',
] as const

function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  const method = req.method ?? 'GET'
  if (method === 'GET' || method === 'HEAD') return Promise.resolve(undefined)
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function toWebRequest(req: IncomingMessage, body: Buffer | undefined): Request {
  const host = req.headers.host ?? 'localhost'
  const url = new URL(req.url ?? '/', `http://${host}`)
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v)
    } else {
      headers.set(key, value)
    }
  }
  return new Request(url, {
    method: req.method ?? 'GET',
    headers,
    body: body && body.length > 0 ? body : undefined,
  })
}

async function writeWebResponse(res: ServerResponse, response: Response): Promise<void> {
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return
    res.setHeader(key, value)
  })
  const cookies = response.headers.getSetCookie()
  if (cookies.length > 0) res.setHeader('set-cookie', cookies)
  res.writeHead(response.status)
  const buf = response.body ? Buffer.from(await response.arrayBuffer()) : Buffer.alloc(0)
  res.end(buf)
}

function apiDevServer(): Plugin {
  return {
    name: 'api-dev-server',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '')
      for (const key of SERVER_ENV_KEYS) {
        if (env[key] !== undefined) process.env[key] = env[key]
      }

      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? ''
        if (!url.startsWith('/api/')) {
          next()
          return
        }

        const name = url.slice('/api/'.length).split(/[/?]/)[0]
        const apiFile = name ? new URL(`api/${name}.ts`, import.meta.url) : null
        if (!name || !API_NAME_RE.test(name) || !apiFile || !existsSync(fileURLToPath(apiFile))) {
          res.writeHead(404, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'not found' }))
          return
        }

        try {
          const mod = (await server.ssrLoadModule(`/api/${name}.ts`)) as Record<string, unknown>
          const method = (req.method ?? 'GET').toUpperCase()
          const handler = mod[method]
          if (typeof handler !== 'function') {
            res.writeHead(405, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: 'method not allowed' }))
            return
          }

          const body = await readBody(req)
          const request = toWebRequest(req, body)
          const response = (await handler(request)) as Response
          await writeWebResponse(res, response)
        } catch (err) {
          console.error(err)
          res.writeHead(500, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'internal error' }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), apiDevServer()],
  server: {
    port: 5173,
    strictPort: false,
  },
  worker: {
    format: 'es',
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('maplibre-gl')) return 'maplibre'
          return undefined
        },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
