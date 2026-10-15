import { NO_RESULTS, searchTerm } from '@/lib/search'
import { getSession } from '@/server/auth/sessions'
import { can } from '@/server/authz/matrix'
import { searchWorkspace } from '@/server/dal/search'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'

export const dynamic = 'force-dynamic'

/** The palette's search across orders, customers and products; every role reads them. */
export async function GET(request: Request): Promise<Response> {
  const session = await getSession()

  if (!session?.secondFactorVerified) return new Response(null, { status: 401 })
  if (!can(session.role, 'data.read', session.workspaceKind)) return new Response(null, { status: 403 })

  const term = searchTerm(new URL(request.url).searchParams.get('q'))
  const results = term ? await withWorkspace(workspaceContext(session), tx => searchWorkspace(tx, session.workspaceId, term)) : NO_RESULTS

  return Response.json(results, { headers: { 'Cache-Control': 'private, no-store' } })
}
