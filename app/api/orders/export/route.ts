import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { parseOrdersQuery } from '@/lib/orders/query'
import { ORDER_STATUSES, type OrderStatus } from '@/lib/orders/status'
import { zonedParts } from '@/lib/periods'
import { getSession, workspaceContext } from '@/server/auth/sessions'
import { can } from '@/server/authz/matrix'
import { authConfig } from '@/server/config'
import { logActivity } from '@/server/dal/activity'
import { getStoreSettings } from '@/server/dal/settings'
import { withWorkspace } from '@/server/db/with-workspace'
import { exportStream, planExport, type ExportLabels } from '@/server/orders/export'
import { consume } from '@/server/ratelimit/consume'
import { hashIp, sessionSubject } from '@/server/ratelimit/ip'
import { LIMITS } from '@/server/ratelimit/limits'
import { getClientIp } from '@/server/request'

export const dynamic = 'force-dynamic'

const idsParam = z.string().transform(value => value.split(',')).pipe(z.array(z.uuid()).min(1).max(100))

/** The CSV of the orders list (spec §8.2): every order matching the filters, or the selected ones. */
export async function GET(request: Request): Promise<Response> {
  const session = await getSession()
  if (!session?.secondFactorVerified) return new Response(null, { status: 401 })
  if (!can(session.role, 'csv.export', session.workspaceKind)) return new Response(null, { status: 403 })
  const params = new URL(request.url).searchParams
  const rawIds = params.get('ids')
  const ids = rawIds === null ? null : idsParam.safeParse(rawIds)
  if (ids && !ids.success) return new Response(null, { status: 400 })
  const verdict = await consume(LIMITS.csvExport, sessionSubject(session.id))
  if (!verdict.allowed) return new Response(null, { status: 429, headers: { 'Retry-After': String(verdict.retryAfterSeconds) } })

  const ctx = workspaceContext(session)
  const now = new Date()
  const settings = await withWorkspace(ctx, tx => getStoreSettings(tx, session.workspaceId))
  const plan = await planExport(ctx, { query: parseOrdersQuery(params), ids: ids ? ids.data : null, now, timeZone: settings.timezone })
  const ipHash = hashIp(await getClientIp(), authConfig().ipHashKey)
  await withWorkspace(ctx, tx => logActivity(tx, session.workspaceId, {
    actorUserId: session.userId,
    action: 'orders.exported',
    details: { rows: plan.ids.length, truncated: plan.truncated, selection: ids !== null },
    ipHash,
  }))

  const t = await getTranslations('orders')
  const labels: ExportLabels = {
    header: [
      t('csv.order'), t('csv.placed'), t('csv.customer'), t('csv.email'), t('csv.items'), t('csv.subtotal'),
      t('csv.shipping'), t('csv.total'), t('csv.status'), t('csv.source'), t('csv.delivery'),
    ],
    status: Object.fromEntries(ORDER_STATUSES.map(status => [status, t(`status.${status}`)])) as Record<OrderStatus, string>,
    source: { seed: t('source.seed'), stripe: t('source.stripe') },
    delivery: { standard: t('delivery.standard'), express: t('delivery.express') },
  }
  const day = zonedParts(now, settings.timezone)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return new Response(exportStream(ctx, plan.ids, labels, settings.timezone), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="orders-${day.year}-${pad(day.month)}-${pad(day.day)}.csv"`,
      'Cache-Control': 'private, no-store',
      ...(plan.truncated ? { 'X-Export-Truncated': 'true' } : {}),
    },
  })
}
