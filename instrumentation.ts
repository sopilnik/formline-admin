import type { Instrumentation } from 'next'

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { readEnv } = await import('@/server/env')
    const env = readEnv()
    // While the database is unreachable the container start runs the server in maintenance mode: nothing here
    // may wait for the database then, and the start restarts the server without the flag once the database is back.
    if (env.FORMLINE_MAINTENANCE === '1') return
    const { getPool } = await import('@/server/db/pool')
    const { assertAppRole } = await import('@/server/db/role-check')
    await assertAppRole(getPool())
    const { scheduleDailyJob } = await import('@/server/jobs/daily')
    scheduleDailyJob()
  }
}

/** Logs every error a request ends in with the id its response carried in X-Request-Id, so a reported id finds its line. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { log } = await import('@/server/log')
  const id = request.headers['x-request-id']
  log.error({
    event: 'request.failed',
    requestId: Array.isArray(id) ? id[0] : id,
    method: request.method,
    path: request.path,
    route: context.routePath,
    err: error,
  })
}
