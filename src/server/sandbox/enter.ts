import 'server-only'
import type { Pool } from 'pg'
import type { Locale } from '@/i18n/locale'
import { generateToken, hashToken } from '@/server/auth/tokens'
import { asDate } from '@/server/db/as-date'
import { getPool } from '@/server/db/pool'

export type SandboxEntry =
  | { ok: true; token: string; workspaceId: string; userId: string; expiresAt: Date }
  | { ok: false; error: 'demo_full' | 'demo_rate_limited'; retryAfterSeconds?: number }

export type VisitorMeta = { ipHash: string | null; userAgentSummary: string | null; locale: Locale }

/** The row create_sandbox and reset_sandbox return. */
export type EntryRow = {
  outcome: 'created' | 'rate_limited' | 'full'
  sandbox_id: string | null
  demo_user_id: string | null
  sandbox_expires_at: Date | string | null
  retry_after_seconds: number
}

export function entryFromRow(row: EntryRow, token: string): SandboxEntry {
  if (row.outcome === 'created') return { ok: true, token, workspaceId: row.sandbox_id!, userId: row.demo_user_id!, expiresAt: asDate(row.sandbox_expires_at!) }
  if (row.outcome === 'rate_limited') return { ok: false, error: 'demo_rate_limited', retryAfterSeconds: row.retry_after_seconds }

  return { ok: false, error: 'demo_full' }
}

/**
 * Opens a fresh sandbox for a visitor and returns the raw session
 * token for its cookie. The database does the copying, the limit and the cap in
 * one call; no workspace context exists yet, so this runs on the bare pool.
 */
export async function enterSandbox(input: VisitorMeta, pool: Pool = getPool()): Promise<SandboxEntry> {
  const token = generateToken()
  const { rows } = await pool.query<EntryRow>('select * from fa.create_sandbox($1, $2, $3, $4)', [input.ipHash, hashToken(token), input.userAgentSummary, input.locale])

  return entryFromRow(rows[0]!, token)
}
