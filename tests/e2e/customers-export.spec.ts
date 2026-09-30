import { readFile } from 'node:fs/promises'
import { E2E_ORIGIN_SECRET } from './constants'
import { asSchemaOwner } from './db'
import { signInAsSandboxUser } from './sessions'
import { expect, test } from './test'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.42' } })

async function csvLines(path: string): Promise<{ bom: boolean; lines: string[] }> {
  const bytes = await readFile(path)
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
  return { bom, lines: bytes.subarray(bom ? 3 : 0).toString('utf8').split('\r\n').filter(line => line !== '') }
}

test.describe('customers CSV export', () => {
  test('downloads every customer the search keeps and logs the export', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context, 'viewer')
    const kept = await asSchemaOwner(async c => (await c.query<{ n: number }>(
      "select count(*)::int as n from fa.customers where workspace_id = $1 and (name ilike '%carter%' or email ilike '%carter%')", [workspaceId])).rows[0]!.n)
    await page.goto('/customers?q=carter')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: `Export ${kept} as CSV` }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/^customers-\d{4}-\d{2}-\d{2}\.csv$/)
    const { bom, lines } = await csvLines(await file.path())
    expect(bom).toBe(true)
    expect(lines[0]).toBe('Customer,Email,City,Country,Orders,Total spent,First order,Last order,Customer since')
    expect(lines).toHaveLength(kept + 1)
    expect(lines.slice(1).every(line => /carter/i.test(line))).toBe(true)
    const logged = await asSchemaOwner(async c => (await c.query<{ details: { rows: number; truncated: boolean } }>(
      "select details from fa.activity_log where workspace_id = $1 and action = 'customers.exported'", [workspaceId])).rows)
    expect(logged).toEqual([{ details: { rows: kept, truncated: false } }])
  })

  test('writes the Russian headers for a Russian interface', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/customers?lang=ru')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: /^Выгрузить \d+ в CSV$/ }).click()
    const { lines } = await csvLines(await (await download).path())
    expect(lines[0]).toBe('Покупатель,Email,Город,Страна,Заказов,Потрачено,Первый заказ,Последний заказ,Покупатель с')
  })

  test('answers 401 without a session', async ({ request }) => {
    const response = await request.get('/api/customers/export')
    expect(response.status()).toBe(401)
  })
})
