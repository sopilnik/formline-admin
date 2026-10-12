import 'server-only'
import { sql } from 'drizzle-orm'
import type { Pool } from 'pg'
import { workspaceContext, type Session } from '@/server/auth/sessions'
import { generateToken, hashToken } from '@/server/auth/tokens'
import { getPool } from '@/server/db/pool'
import { withWorkspace } from '@/server/db/with-workspace'
import { entryFromRow, type EntryRow, type SandboxEntry, type VisitorMeta } from '@/server/sandbox/enter'

/** Deletes the current sandbox; its session goes with it (spec §6.4). Returns the number of image paths queued. */
export async function endSandbox(session: Session, pool: Pool = getPool()): Promise<number> {
  const result = await withWorkspace(workspaceContext(session), tx => tx.execute<{ queued: number }>(sql`select fa.end_sandbox() as queued`), pool)
  return result.rows[0]?.queued ?? 0
}

/** A fresh copy for the same visitor; counts against the per-address limit like an entry (spec §6.4). */
export async function resetSandbox(session: Session, input: VisitorMeta, pool: Pool = getPool()): Promise<SandboxEntry> {
  const token = generateToken()
  const result = await withWorkspace(workspaceContext(session), tx => tx.execute<EntryRow>(
    sql`select * from fa.reset_sandbox(${input.ipHash}, ${hashToken(token)}, ${input.userAgentSummary}, ${input.locale})`), pool)
  return entryFromRow(result.rows[0]!, token)
}
