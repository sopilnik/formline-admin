import 'server-only'
import type { Pool } from 'pg'
import { AppRoleError, assertAppRole } from '@/server/db/role-check'

export type Readiness = { status: 'ok'; db: 'ok'; role: 'ok' } | { status: 'unavailable'; failed: 'db' | 'role' }

/**
 * The readiness check of the smoke test and the probes (spec §13): the database answers in time and the server's role
 * passes the assertion. Liveness never comes here, so bunny's health check never wakes the database.
 */
export async function readiness(pool: Pool, timeoutMs = 5_000): Promise<Readiness> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('the database did not answer in time')), timeoutMs)
  })
  try {
    await Promise.race([assertAppRole(pool), late])
    return { status: 'ok', db: 'ok', role: 'ok' }
  } catch (error) {
    return { status: 'unavailable', failed: error instanceof AppRoleError ? 'role' : 'db' }
  } finally {
    clearTimeout(timer)
  }
}
