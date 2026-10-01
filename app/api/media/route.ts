import { z } from 'zod'
import { UPLOAD_MAX_BYTES, type UploadError } from '@/lib/uploads'
import { actorOf } from '@/server/actor'
import { getSession } from '@/server/auth/sessions'
import { can } from '@/server/authz/matrix'
import { authConfig } from '@/server/config'
import { processImage } from '@/server/media/image'
import { mediaStorage } from '@/server/media/storage'
import { storeProductImage } from '@/server/media/upload'
import { consume } from '@/server/ratelimit/consume'
import { sessionSubject } from '@/server/ratelimit/ip'
import { LIMITS } from '@/server/ratelimit/limits'
import { readCapped } from '@/server/read-capped'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const refuse = (status: number, error: UploadError, headers: Record<string, string> = {}): Response =>
  Response.json({ ok: false, error }, { status, headers: { ...NO_STORE, ...headers } })

const productParam = z.uuid()

/**
 * `POST /api/media?product=<id>` with the image file as the body (spec §8.4): a route handler, so
 * the Server Action body limit stays at 1 MB. The request proves itself as the panel's own
 * (spec §5.6): a session that may write the catalog, `Origin` equal to the site, and the
 * `X-Requested-With: formline` header, which a cross-site form cannot send without a preflight.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await getSession()
  if (!session?.secondFactorVerified) return refuse(401, 'unauthenticated')
  if (!can(session.role, 'catalog.write', session.workspaceKind)) return refuse(403, 'forbidden')
  if (request.headers.get('x-requested-with') !== 'formline' || request.headers.get('origin') !== authConfig().origin) return refuse(403, 'forbidden')
  const productId = productParam.safeParse(new URL(request.url).searchParams.get('product'))
  if (!productId.success) return refuse(400, 'invalid')
  const storage = mediaStorage()
  if (!storage) return refuse(503, 'unavailable')
  const verdict = await consume(LIMITS.upload, sessionSubject(session.id))
  if (!verdict.allowed) return refuse(429, 'rate_limited', { 'Retry-After': String(verdict.retryAfterSeconds) })
  if (Number(request.headers.get('content-length') ?? 0) > UPLOAD_MAX_BYTES) return refuse(413, 'too_large')
  const body = await readCapped(request.body, UPLOAD_MAX_BYTES)
  if (body === 'too_large') return refuse(413, 'too_large')
  if (body.length === 0) return refuse(400, 'invalid')
  const image = await processImage(body)
  if (typeof image === 'string') return refuse(image === 'type' ? 415 : 422, image)
  const result = await storeProductImage(await actorOf(session), productId.data, image, storage)
  if (!result.ok) return result.reason === 'cap' ? refuse(409, 'cap') : refuse(404, 'not_found')
  return Response.json({ ok: true, image: { id: result.imageId, width: result.width, height: result.height } }, { status: 201, headers: NO_STORE })
}
