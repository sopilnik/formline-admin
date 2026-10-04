import { getPool } from '@/server/db/pool'
import { readiness } from '@/server/health'
import { log } from '@/server/log'

// Liveness by default: bunny's health check and the budget guard call it every few minutes, so it never wakes the
// database. `?db=1` is the readiness check of the smoke test and the probes (spec §13); unlike liveness it must pass the
// edge check (proxy.ts), so nobody can wake the database through it from outside.
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET(request: Request): Promise<Response> {
  if (new URL(request.url).searchParams.get('db') !== '1') {
    // The image's commit (Dockerfile): a deploy waits until the new container answers with it.
    const version = process.env.FORMLINE_VERSION
    return Response.json({ status: 'ok', ...(version ? { version } : {}) }, { headers: NO_STORE })
  }
  const result = await readiness(getPool())
  if (result.status !== 'ok') log.warn({ event: 'health.not_ready', failed: result.failed })
  return Response.json(result, { status: result.status === 'ok' ? 200 : 503, headers: NO_STORE })
}
