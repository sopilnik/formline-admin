import 'server-only'
import type { Pool } from 'pg'
import { isBreachedPassword } from '@/server/auth/hibp'
import { authConfig, type AuthConfig } from '@/server/config'
import { getPool } from '@/server/db/pool'

/** What the auth flows depend on; tests replace the pool, the clock, the breach check or the configuration. */
export type AuthDeps = {
  pool: Pool
  now: () => number
  isBreached: (password: string) => Promise<boolean | null>
  config: AuthConfig
}

export function authDeps(overrides: Partial<AuthDeps> = {}): AuthDeps {
  return {
    pool: overrides.pool ?? getPool(),
    now: overrides.now ?? Date.now,
    isBreached: overrides.isBreached ?? isBreachedPassword,
    config: overrides.config ?? authConfig(),
  }
}
