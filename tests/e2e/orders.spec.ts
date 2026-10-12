import { expectNoSeriousA11yViolationsInBothThemes } from './a11y.ts'
import { E2E_ORIGIN_SECRET } from './constants.ts'
import { asSchemaOwner } from './db.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.25' } })

// Expected values come from the sandbox's own rows, never typed in by hand.
const count = (workspaceId: string, where = 'true') =>
  asSchemaOwner(async c => Number((await c.query<{ n: string }>(`select count(*) as n from fa.orders o where o.workspace_id = $1 and (${where})`, [workspaceId])).rows[0]!.n))

const matching = (workspaceId: string, term: string) =>
  asSchemaOwner(async c => Number((await c.query<{ n: string }>(
    'select count(*) as n from fa.orders o join fa.customers c on c.workspace_id = o.workspace_id and c.id = o.customer_id where o.workspace_id = $1 and (c.name ilike $2 or c.email ilike $2)',
    [workspaceId, `%${term}%`])).rows[0]!.n))

const firstNumber = (workspaceId: string, orderBy: string) =>
  asSchemaOwner(async c => (await c.query<{ number: number }>(`select number from fa.orders where workspace_id = $1 order by ${orderBy} limit 1`, [workspaceId])).rows[0]!.number)
// Today and the six days before it in the store's zone, the way presetRange('7d') counts them.
const LAST_7_DAYS = "o.placed_at >= (date_trunc('day', now() at time zone 'Europe/Berlin') - interval '6 days') at time zone 'Europe/Berlin'"

test.describe('orders list', () => {
  test('shows the newest 25 orders, the total and the default sort, and passes axe', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context, 'viewer')
    const total = await count(workspaceId)
    const newest = await firstNumber(workspaceId, 'placed_at desc, id desc')
    await page.goto('/orders')
    await expect(page.getByRole('heading', { level: 1, name: 'Orders' })).toBeVisible()
    await expect(page).toHaveTitle('Orders · Formline Admin')
    await expect(page.getByText(`${total} orders`, { exact: true })).toBeVisible()
    const table = page.getByRole('table', { name: 'Orders' })
    const numbers = table.getByRole('link', { name: /^#\d+$/ })
    await expect(numbers).toHaveCount(25)
    await expect(numbers.first()).toHaveText(`#${newest}`)
    await expect(numbers.first()).toHaveAttribute('href', `/orders/${newest}`)
    await expect(page.getByRole('columnheader', { name: 'Placed' })).toHaveAttribute('aria-sort', 'descending')
    await expect(page.getByRole('list', { name: 'Orders' })).toBeHidden()
    await expectNoSeriousA11yViolationsInBothThemes(page)
  })

  test('filters by status chips, counts without the status filter and clears', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    const total = await count(workspaceId)
    const paid = await count(workspaceId, "o.status = 'paid'")
    const processing = await count(workspaceId, "o.status = 'processing'")
    await page.goto('/orders')
    const chips = page.getByRole('group', { name: 'Status' })
    await expect(chips.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(chips.getByRole('button', { name: /^Paid/ })).toHaveAccessibleName(`Paid, ${paid}`)
    await chips.getByRole('button', { name: /^Paid/ }).click()
    await expect(page).toHaveURL(/\/orders\?status=paid$/)
    await chips.getByRole('button', { name: /^Processing/ }).click()
    await expect(page).toHaveURL(/\/orders\?status=paid,processing$/)
    await expect(page.getByText(`${paid + processing} of ${total} orders`)).toBeVisible()
    await expect(chips.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'false')
    await expect(chips.getByRole('button', { name: /^Paid/ })).toHaveAttribute('aria-pressed', 'true')
    const table = page.getByRole('table', { name: 'Orders' })
    for (const other of ['Shipped', 'Delivered', 'Cancelled', 'Refunded']) await expect(table.getByText(other, { exact: true })).toHaveCount(0)
    await chips.getByRole('button', { name: /^All/ }).click()
    await expect(page).toHaveURL(/\/orders$/)
    await chips.getByRole('button', { name: /^Shipped/ }).click()
    await expect(page).toHaveURL(/\/orders\?status=shipped$/)
    await page.getByRole('link', { name: 'Clear filters' }).click()
    await expect(page).toHaveURL(/\/orders$/)
    await expect(chips.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'true')
  })

  test('searches by number and by customer, says when nothing matches, and clears the field', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    const order = await asSchemaOwner(async c => (await c.query<{ number: number; name: string }>(
      'select o.number, c.name from fa.orders o join fa.customers c on c.workspace_id = o.workspace_id and c.id = o.customer_id where o.workspace_id = $1 order by o.number offset 299 limit 1',
      [workspaceId])).rows[0]!)
    const total = await count(workspaceId)
    const lastName = order.name.split(' ').at(-1)!
    const byName = await matching(workspaceId, lastName)
    await page.goto('/orders')
    const search = page.getByRole('searchbox', { name: 'Search orders' })
    await search.fill(String(order.number))
    await expect(page).toHaveURL(new RegExp(`\\?q=${order.number}$`))
    const table = page.getByRole('table', { name: 'Orders' })
    await expect(table.getByRole('link', { name: /^#\d+$/ })).toHaveText([`#${order.number}`])
    await search.fill(lastName)
    await expect(page.getByText(`${byName} of ${total} orders`)).toBeVisible()
    await search.fill('nobody@nowhere.invalid')
    await expect(page.getByText('No orders match these filters')).toBeVisible()
    await page.getByRole('link', { name: 'Clear filters' }).first().click()
    await expect(page).toHaveURL(/\/orders$/)
    await expect(search).toHaveValue('')
  })

  test('filters by date preset and source and shows the choice in the selected style', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    const total = await count(workspaceId)
    const week = await count(workspaceId, LAST_7_DAYS)
    const weekSample = await count(workspaceId, `${LAST_7_DAYS} and o.source = 'seed'`)
    await page.goto('/orders')
    const placed = page.getByLabel('Placed', { exact: true })
    await expect(placed).toHaveValue('any')
    await placed.selectOption('7d')
    await expect(page).toHaveURL(/\/orders\?placed=7d$/)
    await expect(page.getByText(`${week} of ${total} orders`)).toBeVisible()
    const background = await placed.evaluate(el => getComputedStyle(el).backgroundColor)
    expect(background).toBe('rgb(23, 24, 26)')
    await page.getByLabel('Source', { exact: true }).selectOption('seed')
    await expect(page).toHaveURL(/\/orders\?placed=7d&source=seed$/)
    await expect(page.getByText(`${weekSample} of ${total} orders`)).toBeVisible()
  })

  test('sorts through the header links and pages through the list', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    const total = await count(workspaceId)
    const top = await firstNumber(workspaceId, 'total_cents desc, id desc')
    await page.goto('/orders')
    const header = page.getByRole('columnheader', { name: 'Total' })
    await header.getByRole('link').click()
    await expect(page).toHaveURL(/\/orders\?sort=total$/)
    await expect(header).toHaveAttribute('aria-sort', 'descending')
    const numbers = page.getByRole('table', { name: 'Orders' }).getByRole('link', { name: /^#\d+$/ })
    await expect(numbers.first()).toHaveText(`#${top}`)
    await header.getByRole('link').click()
    await expect(page).toHaveURL(/\/orders\?sort=total&dir=asc$/)
    await expect(header).toHaveAttribute('aria-sort', 'ascending')
    const pager = page.getByRole('navigation', { name: 'Pagination' })
    await pager.getByRole('link', { name: 'Next page' }).click()
    await expect(page).toHaveURL(/\/orders\?sort=total&dir=asc&page=2$/)
    await expect(pager.getByRole('link', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page')
    await expect(pager.getByText(`26–50 of ${total}`)).toBeVisible()
    await pager.getByLabel('Orders per page').selectOption('50')
    await expect(page).toHaveURL(/\/orders\?sort=total&dir=asc&size=50$/)
    await expect(numbers).toHaveCount(50)
    await page.goto('/orders?page=999')
    await expect(page).toHaveURL(new RegExp(`/orders\\?page=${Math.ceil(total / 25)}$`))
  })

  test('shows cards below 56 rem, scrolls the chips in one row and never the page', async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 740 })
    await signInAsSandboxUser(context)
    await page.goto('/orders')
    await expect(page.getByRole('table', { name: 'Orders' })).toBeHidden()
    const cards = page.getByRole('list', { name: 'Orders' })
    await expect(cards.getByRole('listitem')).toHaveCount(25)
    const chips = page.getByRole('group', { name: 'Status' })
    const { scroll, client } = await chips.evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth }))
    expect(scroll).toBeGreaterThan(client)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
    await expectNoSeriousA11yViolationsInBothThemes(page)
  })
})
