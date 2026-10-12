import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_CUSTOMERS_QUERY } from '@/lib/customers/query'
import { isoInZone } from '@/lib/periods'
import { customerExportStream, planCustomerExport } from '@/server/customers/export'
import type { WorkspaceContext } from '@/server/db/with-workspace'
import { adminPool, appPool, closeAll } from './db'
import { createSandbox } from './fixtures'

let admin: pg.Pool
let app: pg.Pool
let ctx: WorkspaceContext
const tz = 'Europe/Berlin'
const header = ['Customer', 'Email', 'City', 'Country', 'Orders', 'Total spent', 'First order', 'Last order', 'Customer since']

beforeAll(async () => {
  admin = adminPool()
  app = appPool()
  const { workspaceId, userId } = await createSandbox(app)
  ctx = { workspaceId, userId, role: 'owner' }
  await admin.query(
    "insert into fa.customers (workspace_id, email, name, city) values ($1, 'formula@example.test', '=HYPERLINK(\"x\")', 'Zürich, Altstadt'), ($1, 'olga@example.ru', 'Ольга Смирнова', null)",
    [ctx.workspaceId])
})
afterAll(closeAll)

const read = async (stream: ReadableStream<Uint8Array>): Promise<{ bom: boolean; lines: string[] }> => {
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
  const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes.subarray(bom ? 3 : 0))
  return { bom, lines: text.split('\r\n').filter(line => line !== '') }
}

describe('planCustomerExport', () => {
  it('takes every customer the search keeps, in the list order', async () => {
    const plan = await planCustomerExport(ctx, { query: { ...DEFAULT_CUSTOMERS_QUERY, q: 'carter', sort: 'name', dir: 'asc' } }, app)
    const { rows } = await admin.query<{ id: string }>(
      'select id from fa.customers where workspace_id = $1 and (name ilike $2 or email ilike $2) order by name collate "unicode", id', [ctx.workspaceId, '%carter%'])
    expect(rows.length).toBeGreaterThan(1)
    expect(plan).toEqual({ ids: rows.map(r => r.id), truncated: false })
  })

  it('cuts at the cap and says so', async () => {
    const plan = await planCustomerExport(ctx, { query: DEFAULT_CUSTOMERS_QUERY, cap: 20 }, app)
    expect(plan.ids).toHaveLength(20)
    expect(plan.truncated).toBe(true)
  })
})

describe('customerExportStream', () => {
  it('writes the byte-order mark, the header and one line per customer with the list figures', async () => {
    const plan = await planCustomerExport(ctx, { query: DEFAULT_CUSTOMERS_QUERY }, app)
    const { bom, lines } = await read(customerExportStream(ctx, plan.ids, { header }, tz, app))
    expect(bom).toBe(true)
    expect(lines[0]).toBe('Customer,Email,City,Country,Orders,Total spent,First order,Last order,Customer since')
    expect(lines).toHaveLength(plan.ids.length + 1)
    const { rows } = await admin.query<{ name: string; email: string; city: string; country: string; created: Date; orders: number; spent: number; first: Date; last: Date }>(
      `select c.name, c.email, c.city, c.country, c.created_at as created, count(o.id)::int as orders,
              coalesce(sum(o.total_cents) filter (where o.status in ('paid', 'processing', 'shipped', 'delivered')), 0)::int as spent,
              min(o.placed_at) as first, max(o.placed_at) as last
         from fa.customers c join fa.orders o on o.workspace_id = c.workspace_id and o.customer_id = c.id
        where c.workspace_id = $1 and c.id = $2 group by c.workspace_id, c.id`, [ctx.workspaceId, plan.ids[0]])
    const first = rows[0]!
    expect(lines[1]).toBe([first.name, first.email, first.city, first.country, first.orders, (first.spent / 100).toFixed(2),
      isoInZone(first.first, tz), isoInZone(first.last, tz), isoInZone(first.created, tz)].join(','))
  })

  it('defuses formulas, quotes commas and keeps Cyrillic names', async () => {
    const plan = await planCustomerExport(ctx, { query: { ...DEFAULT_CUSTOMERS_QUERY, sort: 'name', dir: 'asc' } }, app)
    const { lines } = await read(customerExportStream(ctx, plan.ids, { header }, tz, app))
    const formula = lines.find(line => line.includes('formula@example.test'))!
    expect(formula.startsWith('"\'=HYPERLINK(""x"")",formula@example.test,"Zürich, Altstadt",,0,0.00,,,')).toBe(true)
    expect(lines.find(line => line.includes('olga@example.ru'))!.startsWith('Ольга Смирнова,olga@example.ru,,,0,0.00,,,')).toBe(true)
  })
})
