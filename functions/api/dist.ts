const ALLOWED_HOSTS = new Set([
  'api.github.com',
  'codeload.github.com',
  'repo.packagist.org',
  'gitlab.com',
  'bitbucket.org',
])

const MAX_BYTES = 30 * 1024 * 1024
const MAX_REDIRECTS = 5

function allowedTarget(value: string): URL | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) return null
    return url
  } catch {
    return null
  }
}

export const onRequestGet = async ({ request }: { request: Request }): Promise<Response> => {
  const rawTarget = new URL(request.url).searchParams.get('url')
  if (!rawTarget) return new Response('missing url', { status: 400 })

  let target = allowedTarget(rawTarget)
  if (!target) return new Response('host not allowed', { status: 403 })

  let upstream: Response | null = null
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const current: Response = await (fetch as any)(target.toString(), {
      headers: {
        'User-Agent': 'liminal-playground',
        Accept: 'application/zip,application/json,*/*',
        'Accept-Encoding': 'identity',
      },
      redirect: 'manual',
      cf: { cacheEverything: true, cacheTtl: 86400 },
    })
    upstream = current

    if (![301, 302, 303, 307, 308].includes(current.status)) break
    const location = current.headers.get('location')
    if (!location) return new Response('invalid upstream redirect', { status: 502 })
    target = allowedTarget(new URL(location, target).toString())
    if (!target) return new Response('redirect host not allowed', { status: 403 })
    upstream = null
  }

  if (!upstream) return new Response('too many upstream redirects', { status: 502 })

  const declaredLength = Number(upstream.headers.get('content-length') || 0)
  if (declaredLength > MAX_BYTES) return new Response('package archive too large', { status: 413 })

  const body = await upstream.arrayBuffer()
  if (body.byteLength > MAX_BYTES) return new Response('package archive too large', { status: 413 })

  const headers = new Headers(upstream.headers)
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin')
  headers.set('Cache-Control', 'public, max-age=86400')
  headers.set('Content-Length', String(body.byteLength))
  // fetch() may transparently decompress an upstream response. Once the body
  // is buffered, forwarding its old transport encoding makes browsers attempt
  // to decode the already-decoded bytes a second time.
  headers.delete('content-encoding')
  headers.delete('transfer-encoding')
  headers.delete('connection')
  headers.delete('keep-alive')
  headers.delete('proxy-authenticate')
  headers.delete('proxy-authorization')
  headers.delete('te')
  headers.delete('trailer')
  headers.delete('upgrade')
  headers.delete('accept-ranges')
  headers.delete('content-range')
  headers.delete('content-md5')
  headers.delete('digest')
  headers.delete('set-cookie')
  headers.set('Vary', 'Accept-Encoding')

  return new Response(body, { status: upstream.status, headers })
}
