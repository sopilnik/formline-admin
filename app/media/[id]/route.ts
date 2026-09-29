import { z } from 'zod'
import { getSession, workspaceContext } from '@/server/auth/sessions'
import { can } from '@/server/authz/matrix'
import { getUpload } from '@/server/dal/images'
import { withWorkspace } from '@/server/db/with-workspace'
import { mediaStorage } from '@/server/media/storage'

export const dynamic = 'force-dynamic'

// Uploads are never cached anywhere and never read as anything but an image (spec §4.5, §8.4).
const NO_STORE = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
const empty = (status: number): Response => new Response(null, { status, headers: NO_STORE })

/**
 * `GET /media/<id>` (spec §8.4): an uploaded image, only to a signed-in member of its workspace.
 * Another workspace's image and a template poster answer 404 alike, so nobody learns what
 * another sandbox holds and the demo cannot serve as image hosting.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await getSession()
  if (!session?.secondFactorVerified) return empty(401)
  if (!can(session.role, 'data.read', session.workspaceKind)) return empty(404)
  const id = z.uuid().safeParse((await params).id)
  if (!id.success) return empty(404)
  const image = await withWorkspace(workspaceContext(session), tx => getUpload(tx, session.workspaceId, id.data))
  if (!image) return empty(404)
  const storage = mediaStorage()
  if (!storage) return empty(503)
  const bytes = await storage.get(image.storagePath)
  if (!bytes) return empty(404)
  return new Response(new Uint8Array(bytes), {
    headers: { ...NO_STORE, 'Content-Type': 'image/webp', 'Content-Length': String(bytes.length), 'Content-Disposition': 'inline' },
  })
}
