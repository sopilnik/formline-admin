import { createHash, randomUUID } from 'node:crypto'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_QUERY } from '@/lib/orders/query'
import { isoInZone } from '@/lib/periods'
import { generateToken, hashToken } from '@/server/auth/tokens'
import type { WorkspaceContext } from '@/server/db/with-workspace'
import { exportStream, planExport, type ExportLabels } from '@/server/orders/export'
import { adminPool, appPool, closeAll } from './db'

let admin: pg.Pool
let app: pg.Pool
let ctx: WorkspaceContext
const tz = 'Europe/Berlin'
const now = new Date()
const labels: ExportLabels = {
  header: ['Order', 'Placed', 'Customer', 'Email', 'Items', 'Subtotal', 'Shipping', 'Total', 'Status', 'Source', 'Delivery'],
  status: { paid: 'Paid', processing: 'Processing', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled', refunded: 'Refunded' },
  source: { seed: 'Sample', stripe: 'Store' },
  delivery: { standard: 'Standard', express: 'Express' },
}

beforeAll(async () => {
  admin = adminPool()
  app = appPool()
  const { rows } = await app.query<{ outcome: string; sandbox_id: string; demo_user_id: string }>(
    'select outcome, sandbox_id, demo_user_id from fa.create_sandbox($1, $2, $3, $4)',
    [createHash('sha256').update(randomUUID()).digest('hex'), hashToken(generateToken()), 'Vitest', 'en'])
  expect(rows[0]?.outcome).toBe('created')
  ctx = { workspaceId: rows[0]!.sandbox_id, userId: rows[0]!.demo_user_id, role: 'owner' }
})
afterAll(closeAll)

const idsWhere = async (where: string, orderBy: string) =>
  (await admin.query<{ id: string }>(`select id from fa.orders where workspace_id = $1 and (${where}) order by ${orderBy}`, [ctx.workspaceId])).rows.map(r => r.id)

const read = async (stream: ReadableStream<Uint8Array>): Promise<{ bom: boolean; lines: string[] }> => {
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
  const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes.subarray(bom ? 3 : 0))
  return { bom, lines: text.split('\r\n').filter(line => line !== '') }
}

describe('planExport', () => {
  it('takes every order matching the filters, in the list order', async () => {
    const plan = await planExport(ctx, { query: { ...DEFAULT_QUERY, status: ['paid'] }, ids: null, now, timeZone: tz }, app)
    expect(plan).toEqual({ ids: await idsWhere("status = 'paid'", 'placed_at desc, id desc'), truncated: false })
  })

  it('cuts at the cap and says so', async () => {
    const plan = await planExport(ctx, { query: DEFAULT_QUERY, ids: null, now, timeZone: tz, cap: 50 }, app)
    expect(plan.ids).toEqual((await idsWhere('true', 'placed_at desc, id desc')).slice(0, 50))
    expect(plan.truncated).toBe(true)
  })

  it('exports a selection in the list sort and ignores the filters', async () => {
    const chosen = (await idsWhere("status = 'delivered'", 'number')).slice(0, 3)
    const plan = await planExport(ctx, { query: { ...DEFAULT_QUERY, status: ['paid'], sort: 'total', dir: 'asc' }, ids: chosen, now, timeZone: tz }, app)
    expect(plan.ids).toEqual(await idsWhere(`id in ('${chosen.join("','")}')`, 'total_cents asc, id asc'))
  })
})

describe('exportStream', () => {
  it('writes the byte-order mark, the header and one record per order in the planned order', async () => {
    const ids = (await idsWhere('true', 'number desc')).slice(0, 620)
    const { bom, lines } = await read(exportStream(ctx, ids, labels, tz, app))
    expect(bom).toBe(true)
    expect(lines[0]).toBe('Order,Placed,Customer,Email,Items,Subtotal,Shipping,Total,Status,Source,Delivery')
    expect(lines).toHaveLength(621)
    const numbers = (await admin.query<{ number: number }>('select number from fa.orders where workspace_id = $1 and id = any($2) order by number desc', [ctx.workspaceId, ids])).rows
    expect(lines.slice(1).map(line => Number(line.split(',')[0]))).toEqual(numbers.map(r => r.number))
    const { rows } = await admin.query<{ number: number; placed_at: Date; name: string; email: string; items: string; subtotal_cents: number; shipping_cents: number; total_cents: number; status: string; source: string; delivery: string }>(
      `select o.number, o.placed_at, c.name, c.email, (select sum(qty) from fa.order_lines l where l.workspace_id = o.workspace_id and l.order_id = o.id) as items,
              o.subtotal_cents, o.shipping_cents, o.total_cents, o.status, o.source, o.delivery
         from fa.orders o join fa.customers c on c.workspace_id = o.workspace_id and c.id = o.customer_id
        where o.workspace_id = $1 and o.id = $2`, [ctx.workspaceId, ids[0]])
    const o = rows[0]!
    expect(lines[1]).toBe([
      o.number, isoInZone(o.placed_at, tz), o.name, o.email, o.items, (o.subtotal_cents / 100).toFixed(2), (o.shipping_cents / 100).toFixed(2),
      (o.total_cents / 100).toFixed(2), labels.status[o.status as 'paid'], labels.source[o.source as 'seed'], labels.delivery[o.delivery as 'standard'],
    ].join(','))
  })

  it('defuses a customer name a spreadsheet would run as a formula', async () => {
    const [id] = await idsWhere('true', 'number')
    await admin.query(
      'update fa.customers c set name = $3 from fa.orders o where o.workspace_id = $1 and o.id = $2 and c.workspace_id = o.workspace_id and c.id = o.customer_id',
      [ctx.workspaceId, id, '=HYPERLINK("http://x.test","hi")'])
    const { lines } = await read(exportStream(ctx, [id!], labels, tz, app))
    expect(lines[1]).toContain(',"\'=HYPERLINK(""http://x.test"",""hi"")",')
  })
})
