import { readEnv } from '../lib/server/env.js'
import { withErrors, error } from '../lib/server/http.js'
import { requireSession } from '../lib/server/auth.js'
import { getPhotosCollection } from '../lib/server/mongo.js'
import { readPhoto } from '../lib/server/photos.js'

const ID_RE = /^[^|\u0000-\u001f]{1,64}\|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z\|(front|back)$/

export const GET = withErrors(async (request: Request) => {
  const env = readEnv()
  const unauthorized = requireSession(request, env)
  if (unauthorized) return unauthorized

  const url = new URL(request.url)
  const id = url.searchParams.get('id') ?? ''
  if (!ID_RE.test(id)) return error(400, 'invalid "id"')

  const sizeRaw = url.searchParams.get('size')
  const size = sizeRaw === 'full' ? 'full' : 'thumb'

  const col = getPhotosCollection(env)
  const buf = await readPhoto(col, id, size)
  if (buf === null) return error(404, 'not found')

  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})
