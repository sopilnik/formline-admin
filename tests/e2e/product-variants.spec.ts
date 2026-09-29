import { expectNoSeriousA11yViolationsInBothThemes } from './a11y'
import { E2E_ORIGIN_SECRET } from './constants'
import { asSchemaOwner } from './db'
import { signInAsSandboxUser } from './sessions'
import { expect, test } from './test'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.33' } })

const variants = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Variants' })
const stockOf = (workspaceId: string, sku: string) => asSchemaOwner(async c => (await c.query<{ stock: number }>(
  'select stock from fa.product_variants where workspace_id = $1 and sku = $2', [workspaceId, sku])).rows[0]!.stock)

test.describe('product variants', () => {
  test('saves own prices, stock and thresholds, and passes axe', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context, 'admin')
    await page.goto('/products/far-orbit')
    await expect(variants(page).getByRole('group', { name: 'A3 · Ink' })).toContainText('far-orbit-a3-ink')
    await expect(variants(page).getByLabel('Own price, $, A1 · Ink')).toHaveAttribute('placeholder', '71.00')
    await expectNoSeriousA11yViolationsInBothThemes(page)
    await variants(page).getByLabel('Own price, $, A1 · Ink').fill('65')
    await variants(page).getByLabel('Stock, A3 · Ocean').fill('40')
    await variants(page).getByLabel('Low at, A3 · Ocean').fill('6')
    await variants(page).getByRole('button', { name: 'Save variants' }).click()
    await expect(page.getByRole('region', { name: 'Notifications' }).getByText('Variants saved.')).toBeVisible()
    await expect(variants(page).getByLabel('Own price, $, A1 · Ink')).toHaveValue('65.00')
    await expect(variants(page).getByLabel('Stock, A3 · Ocean')).toHaveValue('40')
    expect(await stockOf(workspaceId, 'far-orbit-a3-ocean')).toBe(40)
    const logged = await asSchemaOwner(async c => (await c.query<{ n: string }>(
      "select count(*) as n from fa.activity_log where workspace_id = $1 and action = 'product.variants_updated'", [workspaceId])).rows[0]!.n)
    expect(Number(logged)).toBe(1)
  })

  test('names a bad field and focuses it', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/products/hush')
    await variants(page).getByLabel('Stock, A2 · Ink').fill('-3')
    await variants(page).getByLabel('Own price, $, A3 · Ocean').fill('free')
    await variants(page).getByRole('button', { name: 'Save variants' }).click()
    await expect(variants(page).getByText('A whole number up to 100,000.')).toBeVisible()
    await expect(variants(page).getByText('From 0.01 to 9999.99, or empty.')).toBeVisible()
    await expect(variants(page).getByLabel('Stock, A2 · Ink')).toBeFocused()
    await expect(variants(page).getByLabel('Own price, $, A3 · Ocean')).toHaveValue('free')
  })

  test('refuses to overwrite a stock that moved on, and loads it on request', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    await page.goto('/products/loud')
    await asSchemaOwner(c => c.query("update fa.product_variants set stock = 3 where workspace_id = $1 and sku = 'loud-a3-signal'", [workspaceId]))
    await variants(page).getByLabel('Stock, A3 · Signal').fill('25')
    await variants(page).getByRole('button', { name: 'Save variants' }).click()
    const alert = variants(page).getByRole('alert')
    await expect(alert).toContainText('The stock of loud-a3-signal changed while the page was open')
    expect(await stockOf(workspaceId, 'loud-a3-signal')).toBe(3)
    // The action sits inside the message in nearly its colour: the underline is what marks it as a control.
    // The pointer still rests where Save was clicked, and the page has moved under it: away first, or a hover decides.
    await page.mouse.move(0, 0)
    await expect(alert.getByRole('button', { name: 'Load the current stock' })).toHaveCSS('text-decoration-line', 'underline')
    await alert.getByRole('button', { name: 'Load the current stock' }).click()
    await expect(variants(page).getByLabel('Stock, A3 · Signal')).toHaveValue('3')
    await expect(variants(page).getByRole('alert')).toHaveCount(0)
  })

  test('puts the fields under each variant on a phone', async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await signInAsSandboxUser(context)
    await page.goto('/products/far-orbit')
    const row = variants(page).getByRole('group', { name: 'A3 · Ink' })
    await expect(row.getByText('Stock', { exact: true })).toBeVisible()
    const name = (await row.getByText('far-orbit-a3-ink').boundingBox())!
    const stock = (await row.getByLabel('Stock, A3 · Ink').boundingBox())!
    expect(stock.y).toBeGreaterThan(name.y + name.height)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  })
})
