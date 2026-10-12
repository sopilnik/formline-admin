import { getTranslations } from 'next-intl/server'
import { parseCustomersQuery } from '@/lib/customers/query'
import { zonedParts } from '@/lib/periods'
import { getSession } from '@/server/auth/sessions'
import { can } from '@/server/authz/matrix'
import { authConfig } from '@/server/config'
import { customerExportStream, planCustomerExport } from '@/server/customers/export'
import { logActivity } from '@/server/dal/activity'
import { getStoreSettings } from '@/server/dal/settings'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'
import { consume } from '@/server/ratelimit/consume'
import { hashIp, sessionSubject } from '@/server/ratelimit/ip'
import { LIMITS } from '@/server/ratelimit/limits'
import { getClientIp } from '@/server/request'

export const dynamic = 'force-dynamic'

/** The CSV of the customers list (spec §8.5): every customer the search keeps, with the limits and the log entry of the orders export. */
export async function GET(request: Request): Promise<Response> {
  const session = await getSession()
  if (!session?.secondFactorVerified) return new Response(null, { status: 401 })
  if (!can(session.role, 'csv.export', session.workspaceKind)) return new Response(null, { status: 403 })
  const verdict = await consume(LIMITS.csvExport, sessionSubject(session.id))
  if (!verdict.allowed) return new Response(null, { status: 429, headers: { 'Retry-After': String(verdict.retryAfterSeconds) } })

  const ctx = workspaceContext(session)
  const settings = await withWorkspace(ctx, tx => getStoreSettings(tx, session.workspaceId))
  const plan = await planCustomerExport(ctx, { query: parseCustomersQuery(new URL(request.url).searchParams) })
  const ipHash = hashIp(await getClientIp(), authConfig().ipHashKey)
  await withWorkspace(ctx, tx => logActivity(tx, session.workspaceId, {
    actorUserId: session.userId,
    action: 'customers.exported',
    details: { rows: plan.ids.length, truncated: plan.truncated },
    ipHash,
  }))

  const t = await getTranslations('customers.csv')
  const header = [t('customer'), t('email'), t('city'), t('country'), t('orders'), t('spent'), t('first'), t('last'), t('since')]
  const day = zonedParts(new Date(), settings.timezone)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return new Response(customerExportStream(ctx, plan.ids, { header }, settings.timezone), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="customers-${day.year}-${pad(day.month)}-${pad(day.day)}.csv"`,
      'Cache-Control': 'private, no-store',
      ...(plan.truncated ? { 'X-Export-Truncated': 'true' } : {}),
    },
  })
}
