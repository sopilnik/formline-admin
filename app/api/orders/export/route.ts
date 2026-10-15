import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { ORDER_SELECTION_MAX, parseOrdersQuery } from '@/lib/orders/query'
import { ORDER_STATUSES, type OrderStatus } from '@/lib/orders/status'
import { csvResponse, exportLimited, exportSession, logExport } from '@/server/csv-export'
import { getStoreSettings } from '@/server/dal/settings'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'
import { exportStream, planExport, type ExportLabels } from '@/server/orders/export'

export const dynamic = 'force-dynamic'

const idsParam = z.string().transform(value => value.split(',')).pipe(z.array(z.uuid()).min(1).max(ORDER_SELECTION_MAX))

async function labels(): Promise<ExportLabels> {
  const t = await getTranslations('orders')

  return {
    header: [
      t('csv.order'), t('csv.placed'), t('csv.customer'), t('csv.email'), t('csv.items'), t('csv.subtotal'),
      t('csv.shipping'), t('csv.total'), t('csv.status'), t('csv.source'), t('csv.delivery'),
    ],
    status: Object.fromEntries(ORDER_STATUSES.map(status => [status, t(`status.${status}`)])) as Record<OrderStatus, string>,
    source: { seed: t('source.seed'), stripe: t('source.stripe') },
    delivery: { standard: t('delivery.standard'), express: t('delivery.express') },
  }
}

/** The CSV of the orders list: every order matching the filters, or the selected ones. */
export async function GET(request: Request): Promise<Response> {
  const session = await exportSession()

  if (session instanceof Response) {
    return session
  }

  const params = new URL(request.url).searchParams
  const rawIds = params.get('ids')
  const ids = rawIds === null ? null : idsParam.safeParse(rawIds)

  if (ids && !ids.success) {
    return new Response(null, { status: 400 })
  }

  const limited = await exportLimited(session)

  if (limited) {
    return limited
  }

  const ctx = workspaceContext(session)
  const now = new Date()
  const settings = await withWorkspace(ctx, tx => getStoreSettings(tx, session.workspaceId))
  const plan = await planExport(ctx, { query: parseOrdersQuery(params), ids: ids ? ids.data : null, now, timeZone: settings.timezone })

  await logExport(session, 'orders.exported', { rows: plan.ids.length, truncated: plan.truncated, selection: ids !== null })

  return csvResponse({ name: 'orders', stream: exportStream(ctx, { ids: plan.ids, labels: await labels(), timeZone: settings.timezone }), plan }, settings.timezone, now)
}
