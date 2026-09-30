import { expectNoSeriousA11yViolationsInBothThemes } from './a11y'
import { E2E_ORIGIN_SECRET } from './constants'
import { asSchemaOwner } from './db'
import { signInAsSandboxUser } from './sessions'
import { expect, test } from './test'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.40' } })

const names = (workspaceId: string, orderBy: string) => asSchemaOwner(async c => (await c.query<{ name: string }>(
  `select c.name from fa.customers c
     left join fa.orders o on o.workspace_id = c.workspace_id and o.customer_id = c.id
    where c.workspace_id = $1
    group by c.workspace_id, c.id
    order by ${orderBy}`, [workspaceId])).rows.map(r => r.name))

test.describe('customers list', () => {
  test('lists the customers with the latest order first, 25 to a page, and passes axe', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context, 'viewer')
    const expected = await names(workspaceId, 'max(o.placed_at) desc nulls last, c.name collate "unicode" desc, c.id desc')
    await page.goto('/customers')
    await expect(page.getByRole('heading', { level: 1, name: 'Customers' })).toBeVisible()
    await expect(page).toHaveTitle('Customers · Formline Admin')
    await expect(page.getByText(`${expected.length} customers`)).toBeVisible()
    const table = page.getByRole('table', { name: 'Customers' })
    await expect(table.getByRole('row')).toHaveCount(26)
    await expect(table.getByRole('row').nth(1).getByRole('link')).toHaveText(expected[0]!)
    await expect(table.getByRole('row').nth(1).getByRole('link')).toHaveAttribute('href', /^\/customers\/[0-9a-f-]{36}$/)
    await expect(table.getByRole('columnheader', { name: 'Last order' })).toHaveAttribute('aria-sort', 'descending')
    await expect(page.getByRole('link', { name: 'Customers', exact: true })).toHaveAttribute('aria-current', 'page')
    await expectNoSeriousA11yViolationsInBothThemes(page)
  })

  test('searches by name or email and clears the search', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    const [name] = await names(workspaceId, 'c.name collate "unicode", c.id')
    const email = await asSchemaOwner(async c => (await c.query<{ email: string }>('select email from fa.customers where workspace_id = $1 and name = $2', [workspaceId, name])).rows[0]!.email)
    await page.goto('/customers')
    const table = page.getByRole('table', { name: 'Customers' })
    await page.getByRole('searchbox', { name: 'Search customers' }).fill(email.toUpperCase())
    await expect(page).toHaveURL(new RegExp(`/customers\\?q=${encodeURIComponent(email.toUpperCase()).replace(/\./g, '\\.')}$`))
    await expect(table.getByRole('row')).toHaveCount(2)
    await expect(table.getByRole('link', { name })).toBeVisible()
    await expect(page.getByText(/^1 of \d+ customers$/)).toBeVisible()
    await page.getByRole('searchbox', { name: 'Search customers' }).fill('nobody at all')
    await expect(page.getByRole('heading', { name: 'No customers match this search' })).toBeVisible()
    await page.getByRole('link', { name: 'Clear search' }).first().click()
    await expect(page).toHaveURL(/\/customers$/)
    await expect(table.getByRole('row')).toHaveCount(26)
    await expect(page.getByRole('searchbox', { name: 'Search customers' })).toHaveValue('')
  })

  test('sorts through the header links and pages through the list', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    const byName = await names(workspaceId, 'c.name collate "unicode", c.id')
    await page.goto('/customers')
    const table = page.getByRole('table', { name: 'Customers' })
    await table.getByRole('link', { name: 'Customer' }).click()
    await expect(page).toHaveURL(/\/customers\?sort=name$/)
    await expect(table.getByRole('columnheader', { name: 'Customer' })).toHaveAttribute('aria-sort', 'ascending')
    await expect(table.getByRole('row').nth(1).getByRole('link')).toHaveText(byName[0]!)
    const pager = page.getByRole('navigation', { name: 'Pagination' })
    await pager.getByRole('link', { name: 'Page 2' }).click()
    await expect(page).toHaveURL(/\/customers\?sort=name&page=2$/)
    await expect(pager.getByText(`26–50 of ${byName.length}`)).toBeVisible()
    await expect(table.getByRole('row').nth(1).getByRole('link')).toHaveText(byName[25]!)
    await page.getByLabel('Customers per page').selectOption('100')
    await expect(page).toHaveURL(/\/customers\?sort=name&size=100$/)
    await expect(table.getByRole('row')).toHaveCount(101)
  })

  test('shows the customers as cards on a phone, without a sideways scroll', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('/customers')
    await expect(page.getByRole('table', { name: 'Customers' })).toBeHidden()
    const cards = page.getByRole('list', { name: 'Customers' })
    await expect(cards.getByRole('listitem')).toHaveCount(25)
    await expect(cards.getByRole('listitem').first()).toContainText(/\d+ orders? · last /)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  })
})
