import { getTranslations } from 'next-intl/server'
import { parseCustomersQuery } from '@/lib/customers/query'
import { csvResponse, exportLimited, exportSession, logExport } from '@/server/csv-export'
import { customerExportStream, planCustomerExport } from '@/server/customers/export'
import { getStoreSettings } from '@/server/dal/settings'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'

export const dynamic = 'force-dynamic'

/** The CSV of the customers list: every customer the search keeps, with the limits and the log entry of the orders export. */
export async function GET(request: Request): Promise<Response> {
  const session = await exportSession()

  if (session instanceof Response) return session

  const limited = await exportLimited(session)

  if (limited) return limited

  const ctx = workspaceContext(session)
  const settings = await withWorkspace(ctx, tx => getStoreSettings(tx, session.workspaceId))
  const plan = await planCustomerExport(ctx, { query: parseCustomersQuery(new URL(request.url).searchParams) })

  await logExport(session, 'customers.exported', { rows: plan.ids.length, truncated: plan.truncated })

  const t = await getTranslations('customers.csv')
  const header = [t('customer'), t('email'), t('city'), t('country'), t('orders'), t('spent'), t('first'), t('last'), t('since')]

  return csvResponse({ name: 'customers', stream: customerExportStream(ctx, { ids: plan.ids, labels: { header }, timeZone: settings.timezone }), plan }, settings.timezone)
}
