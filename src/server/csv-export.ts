import 'server-only'
import type { Pool } from 'pg'
import { csvRecord, csvText, CSV_BOM } from '@/lib/csv'
import { dateInZone } from '@/lib/periods'
import { requestIpHash } from '@/server/actor'
import { getSession, type Session } from '@/server/auth/sessions'
import { can } from '@/server/authz/matrix'
import { logActivity } from '@/server/dal/activity'
import { getPool } from '@/server/db/pool'
import { withWorkspace, workspaceContext, type Tx, type WorkspaceContext } from '@/server/db/with-workspace'
import { consume } from '@/server/ratelimit/consume'
import { sessionSubject } from '@/server/ratelimit/ip'
import { LIMITS } from '@/server/ratelimit/limits'

const BATCH = 500

/** The rows of a file in the list's order, and whether the list was cut at the cap. */
export type ExportPlan = { ids: string[]; truncated: boolean }

/** How one list's rows are read, one batch by id, and turned into the file's columns. */
export type ExportRows<R extends { id: string }> = { read: (tx: Tx, ids: string[]) => Promise<R[]>; cells: (row: R) => string[] }

/**
 * A CSV file, batch by batch in the planned order: the header first, then each batch read in its own short
 * transaction when the client asks for more, so no connection waits on a slow reader.
 */
export function batchedCsvStream<R extends { id: string }>(
  ctx: WorkspaceContext,
  { ids, header, rows }: { ids: readonly string[]; header: readonly string[]; rows: ExportRows<R> },
  pool: Pool = getPool(),
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let next = 0

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(CSV_BOM + csvRecord(header.map(csvText))))
    },
    async pull(controller) {
      if (next >= ids.length) {
        controller.close()

        return
      }

      const slice = ids.slice(next, next + BATCH)

      next += BATCH

      const found = await withWorkspace(ctx, tx => rows.read(tx, slice), pool)
      const byId = new Map(found.map(row => [row.id, row]))
      let text = ''

      for (const id of slice) {
        const row = byId.get(id)

        if (row) {
          text += csvRecord(rows.cells(row))
        }
      }

      controller.enqueue(encoder.encode(text))
    },
  })
}

/** The download: the file named after the list and the store's date, never cached, and marked when the list was cut. */
export function csvResponse(
  { name, stream, plan }: { name: string; stream: ReadableStream<Uint8Array>; plan: ExportPlan },
  timeZone: string,
  now: Date = new Date(),
): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}-${dateInZone(now, timeZone)}.csv"`,
      'Cache-Control': 'private, no-store',
      ...(plan.truncated ? { 'X-Export-Truncated': 'true' } : {}),
    },
  })
}

/** The member who may download a list: signed in past the second factor, in a role that exports; else the 401 or 403. */
export async function exportSession(): Promise<Session | Response> {
  const session = await getSession()

  if (!session?.secondFactorVerified) {
    return new Response(null, { status: 401 })
  }
  if (!can(session.role, 'csv.export', session.workspaceKind)) {
    return new Response(null, { status: 403 })
  }

  return session
}

/** The export limit of the session: null while it allows one more file, else the 429 with its wait. */
export async function exportLimited(session: Session): Promise<Response | null> {
  const verdict = await consume(LIMITS.csvExport, sessionSubject(session.id))

  return verdict.allowed ? null : new Response(null, { status: 429, headers: { 'Retry-After': String(verdict.retryAfterSeconds) } })
}

/** The activity entry of a download, with the address hash of the request. */
export async function logExport(session: Session, action: 'orders.exported' | 'customers.exported', details: Record<string, unknown>): Promise<void> {
  const ipHash = await requestIpHash()

  await withWorkspace(workspaceContext(session), tx => logActivity(tx, session.workspaceId, { actorUserId: session.userId, action, details, ipHash }))
}
