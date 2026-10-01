import { readFile } from 'node:fs/promises'
import { roomInWindow } from '../windows'
import { E2E_ORIGIN_SECRET } from './constants'
import { asSchemaOwner } from './db'
import { signInAsSandboxUser } from './sessions'
import { expect, test } from './test'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.29' } })

const count = (workspaceId: string, where: string) =>
  asSchemaOwner(async c => Number((await c.query<{ n: string }>(`select count(*) as n from fa.orders o where o.workspace_id = $1 and (${where})`, [workspaceId])).rows[0]!.n))

async function csvLines(path: string): Promise<{ bom: boolean; lines: string[] }> {
  const bytes = await readFile(path)
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
  return { bom, lines: bytes.subarray(bom ? 3 : 0).toString('utf8').split('\r\n').filter(line => line !== '') }
}

test.describe('CSV export', () => {
  test('downloads every order matching the filters, with the byte-order mark and the dictionary headers', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context, 'viewer')
    const paid = await count(workspaceId, "o.status = 'paid'")
    await page.goto('/orders?status=paid')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: `Export ${paid} as CSV` }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/^orders-\d{4}-\d{2}-\d{2}\.csv$/)
    const { bom, lines } = await csvLines(await file.path())
    expect(bom).toBe(true)
    expect(lines[0]).toBe('Order,Placed,Customer,Email,Items,Subtotal,Shipping,Total,Status,Source,Delivery')
    expect(lines).toHaveLength(paid + 1)
    expect(lines.slice(1).every(line => line.includes(',Paid,'))).toBe(true)
    const logged = await asSchemaOwner(async c => (await c.query<{ details: { rows: number; truncated: boolean; selection: boolean } }>(
      "select details from fa.activity_log where workspace_id = $1 and action = 'orders.exported'", [workspaceId])).rows)
    expect(logged).toEqual([{ details: { rows: paid, truncated: false, selection: false } }])
  })

  test('exports the selected orders in the list order', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/orders')
    const table = page.getByRole('table', { name: 'Orders' })
    const links = table.getByRole('link', { name: /^#\d+$/ })
    await expect(links).toHaveCount(25)
    const numbers = (await links.allTextContents()).slice(0, 2).map(text => text.slice(1))
    await table.getByRole('checkbox', { name: `Select order #${numbers[0]}` }).check()
    await table.getByRole('checkbox', { name: `Select order #${numbers[1]}` }).check()
    const download = page.waitForEvent('download')
    await table.getByRole('button', { name: 'Export selected' }).click()
    const { lines } = await csvLines(await (await download).path())
    expect(lines.slice(1).map(line => line.split(',')[0])).toEqual(numbers)
  })

  test('writes the Russian headers and words for a Russian interface', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/orders?status=delivered&lang=ru')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: /^Выгрузить \d+ в CSV$/ }).click()
    const { lines } = await csvLines(await (await download).path())
    expect(lines[0]).toBe('Заказ,Оформлен,Покупатель,Email,Товаров,Подытог,Доставка,Итого,Статус,Источник,Способ доставки')
    expect(lines[1]).toContain(',Доставлен,')
  })

  test('answers 401 without a session and 400 for malformed ids', async ({ page, context, request }) => {
    expect((await request.get('/api/orders/export')).status()).toBe(401)
    await signInAsSandboxUser(context)
    await page.goto('/orders')
    expect(await page.evaluate(async () => (await fetch('/api/orders/export?ids=not-a-uuid')).status)).toBe(400)
  })

  test('refuses exports past ten a minute with a message', async ({ page, context }) => {
    // Fixed one-minute windows: the loop and the refused export below count in the same one.
    await roomInWindow(60, 15)
    await signInAsSandboxUser(context)
    await page.goto('/orders?status=cancelled')
    const statuses = await page.evaluate(async () => {
      const out: number[] = []
      while (out.length < 21 && out.at(-1) !== 429) out.push((await fetch('/api/orders/export?status=cancelled')).status)
      return out
    })
    expect(statuses.at(-1)).toBe(429)
    expect(statuses.filter(status => status === 200).length).toBeGreaterThanOrEqual(10)
    await page.getByRole('button', { name: /^Export \d+ as CSV$/ }).click()
    // Base UI announces an error toast through a separate alert and hides the visible copy from the accessibility
    // tree, so the text is looked up by its text inside the toast list.
    await expect(page.getByRole('region', { name: 'Messages' }).getByText(/^Too many exports\. Try again in \d+ seconds?\.$/)).toBeVisible()
  })
})
