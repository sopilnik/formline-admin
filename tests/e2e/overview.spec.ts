import { expectNoSeriousA11yViolationsInBothThemes } from './a11y'
import { E2E_ORIGIN_SECRET } from './constants'
import { asSchemaOwner } from './db'
import { signInAsSandboxUser } from './sessions'
import { expect, test } from './test'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.27' } })

const one = (text: string, params: unknown[]) => asSchemaOwner(async c => Number((await c.query<{ n: string }>(text, params)).rows[0]!.n))
const REVENUE = "o.status in ('paid', 'processing', 'shipped', 'delivered')"
// The 30-day period: from midnight 29 days ago in the store's zone to now (amendment 4).
const LAST_30_DAYS = "o.placed_at >= (date_trunc('day', now() at time zone 'Europe/Berlin') - interval '29 days') at time zone 'Europe/Berlin'"
const dollars = (cents: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(cents / 100)

test.describe('overview', () => {
  test('names both ranges, shows the KPIs with their definitions and passes axe', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context, 'viewer')
    const revenue = await one(`select coalesce(sum(o.total_cents), 0) as n from fa.orders o where o.workspace_id = $1 and ${REVENUE} and ${LAST_30_DAYS}`, [workspaceId])
    const orders = await one(`select count(*) as n from fa.orders o where o.workspace_id = $1 and ${REVENUE} and ${LAST_30_DAYS}`, [workspaceId])
    await page.goto('/overview')
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
    await expect(page.getByText(/^\d{1,2} \w{3,4}[  ]–[  ]\d{1,2} \w{3,4}, compared with \d{1,2} \w{3,4}[  ]–[  ]\d{1,2} \w{3,4}$/)).toBeVisible()
    const periods = page.getByRole('navigation', { name: 'Period' })
    await expect(periods.getByRole('link', { name: '30 days' })).toHaveAttribute('aria-current', 'page')
    const figures = page.getByRole('region', { name: 'Key figures' })
    for (const label of ['Revenue', 'Orders', 'Average order value', 'New customers']) await expect(figures.getByRole('heading', { name: label, exact: true })).toBeVisible()
    await expect(figures.getByRole('group', { name: 'Revenue' }).getByText(dollars(revenue), { exact: true })).toBeVisible()
    await expect(figures.getByRole('group', { name: 'Orders', exact: true }).getByText(String(orders), { exact: true })).toBeVisible()
    const about = figures.getByRole('button', { name: 'About revenue' })
    await expect(about).toHaveAccessibleDescription('The sum of the totals of the paid, processing, shipped and delivered orders placed in the period.')
    await about.hover()
    await expect(page.getByText('The sum of the totals of the paid, processing, shipped and delivered orders placed in the period.').last()).toBeVisible()
    await expectNoSeriousA11yViolationsInBothThemes(page)
  })

  test('switches the period through links', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/overview')
    const periods = page.getByRole('navigation', { name: 'Period' })
    await expect(periods.getByRole('link', { name: '30 days' })).toHaveAttribute('href', '/overview')
    await periods.getByRole('link', { name: '7 days' }).click()
    await expect(page).toHaveURL(/\/overview\?period=7d$/)
    await expect(periods.getByRole('link', { name: '7 days' })).toHaveAttribute('aria-current', 'page')
    await periods.getByRole('link', { name: 'This month' }).click()
    await expect(page).toHaveURL(/\/overview\?period=month$/)
    await expect(periods.getByRole('link', { name: 'This month' })).toHaveAttribute('aria-current', 'page')
  })

  test('links what needs action now, counts it in the menu, and hides the strip when nothing does', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    const toProcess = await one("select count(*) as n from fa.orders where workspace_id = $1 and status = 'paid'", [workspaceId])
    const processing = await one("select count(*) as n from fa.orders where workspace_id = $1 and status = 'processing'", [workspaceId])
    const soldOut = await one("select count(*) as n from fa.product_variants v join fa.products p on p.workspace_id = v.workspace_id and p.id = v.product_id where v.workspace_id = $1 and v.stock = 0 and p.status <> 'archived'", [workspaceId])
    await page.goto('/overview')
    const strip = page.getByRole('navigation', { name: 'Needs attention' })
    await expect(strip.getByRole('link', { name: `${toProcess} orders to process` })).toHaveAttribute('href', '/orders?status=paid')
    if (processing > 0) await expect(strip.getByRole('link', { name: `${processing} in processing` })).toHaveAttribute('href', '/orders?status=processing')
    if (soldOut > 0) await expect(strip.getByRole('link', { name: `${soldOut} ${soldOut === 1 ? 'variant' : 'variants'} sold out` })).toHaveAttribute('href', '/products?stock=out')
    await expect(page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: `Orders, ${toProcess} to process` })).toBeVisible()
    await asSchemaOwner(async c => {
      await c.query("update fa.orders set status = 'delivered' where workspace_id = $1 and status in ('paid', 'processing')", [workspaceId])
      await c.query('update fa.product_variants set stock = 5 where workspace_id = $1 and stock = 0', [workspaceId])
    })
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Needs attention' })).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Orders', exact: true })).toBeVisible()
  })

  test('fits a phone in Russian without sideways scrolling', async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await signInAsSandboxUser(context)
    await page.goto('/overview?lang=ru')
    await expect(page.getByRole('heading', { level: 1, name: 'Обзор' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Ключевые показатели' }).getByRole('heading', { name: 'Средний чек' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  })

  test('stacks the period links under the subtitle and lists the latest orders on a phone', async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await signInAsSandboxUser(context)
    await page.goto('/overview')
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
    const subtitle = (await page.getByText(/, compared with /).boundingBox())!
    const periods = (await page.getByRole('navigation', { name: 'Period' }).boundingBox())!
    // The subtitle keeps the width of the page and the period links sit under it, not beside it.
    expect(subtitle.width).toBeGreaterThan(300)
    expect(periods.y).toBeGreaterThanOrEqual(subtitle.y + subtitle.height)
    const latest = page.getByRole('region', { name: 'Latest orders' })
    await expect(latest.getByRole('table')).toHaveCount(0)
    const list = latest.getByRole('list', { name: 'Latest orders' })
    await expect(list.getByRole('listitem')).toHaveCount(8)
    await expect(list.getByRole('listitem').first().getByRole('link', { name: /^#\d+$/ })).toBeVisible()
    expect(await list.evaluate(el => el.scrollWidth - el.clientWidth)).toBe(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  })

  test('draws the revenue with the previous period, explains itself and shows the same data as a table', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/overview')
    const card = page.getByRole('region', { name: 'Revenue by day', exact: true })
    await expect(card.getByRole('img', { name: /^Revenue by day, .+: \$[\d,]+, (up [\d.]+%|down [\d.]+%|no change|no earlier data)$/ })).toBeVisible()
    await card.locator('[data-bucket]').last().hover()
    await expect(card.getByText(/today so far/)).toBeVisible()
    const toggle = card.getByRole('button', { name: 'Show as table' })
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    const table = card.getByRole('table', { name: 'Revenue by day' })
    await expect(table.getByRole('row')).toHaveCount(31)
    await expect(table.getByRole('row').last().getByRole('rowheader')).toContainText('today so far')
    await expect(card.getByRole('img')).toHaveCount(0)
    await page.goto('/overview?period=90d')
    await expect(page.getByRole('region', { name: 'Revenue by week', exact: true }).getByRole('img', { name: /^Revenue by week, / })).toBeVisible()
  })

  test('splits the posters by collection and shows posters and shipping', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    const sums = await asSchemaOwner(async c => (await c.query<{ posters: string; shipping: string }>(
      `select coalesce(sum(o.subtotal_cents), 0) as posters, coalesce(sum(o.shipping_cents), 0) as shipping from fa.orders o where o.workspace_id = $1 and ${REVENUE} and ${LAST_30_DAYS}`,
      [workspaceId])).rows[0]!)
    await page.goto('/overview')
    const card = page.getByRole('region', { name: 'Revenue by collection' })
    for (const name of ['Monochrome', 'Primary', 'Pastel', 'Night']) await expect(card.getByText(name, { exact: true })).toBeVisible()
    await expect(card.getByText(/^\d+ posters?$/).first()).toBeVisible()
    await expect(card.getByText(`Posters ${dollars(Number(sums.posters))}`)).toBeVisible()
    await expect(card.getByText(`Shipping ${dollars(Number(sums.shipping))}`)).toBeVisible()
  })

  test('lists the latest orders and the variants running low', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    const newest = await asSchemaOwner(async c => (await c.query<{ number: number }>('select number from fa.orders where workspace_id = $1 order by placed_at desc, id desc limit 1', [workspaceId])).rows[0]!.number)
    const low = await one(
      "select count(*) as n from fa.product_variants v join fa.products p on p.workspace_id = v.workspace_id and p.id = v.product_id where v.workspace_id = $1 and v.stock <= v.low_stock_threshold and p.status <> 'archived'",
      [workspaceId])
    const soldOut = await one('select count(*) as n from fa.product_variants where workspace_id = $1 and stock = 0', [workspaceId])
    await page.goto('/overview')
    const latest = page.getByRole('region', { name: 'Latest orders' })
    const links = latest.getByRole('link', { name: /^#\d+$/ })
    await expect(links).toHaveCount(8)
    await expect(latest.getByRole('table')).toBeVisible()
    await expect(latest.getByRole('listitem')).toHaveCount(0)
    await expect(links.first()).toHaveText(`#${newest}`)
    await expect(links.first()).toHaveAttribute('href', `/orders/${newest}`)
    await expect(latest.getByRole('link', { name: 'All orders' })).toHaveAttribute('href', '/orders')
    const stock = page.getByRole('region', { name: 'Low stock' })
    await expect(stock.getByRole('listitem')).toHaveCount(Math.min(5, low))
    if (soldOut > 0) await expect(stock.getByRole('listitem').first()).toContainText('Sold out')
    await expect(stock.getByRole('link', { name: `View all ${low}` })).toHaveAttribute('href', '/products?stock=low')
  })
})
