import { expectNoSeriousA11yViolationsInBothThemes } from './a11y'
import { E2E_ORIGIN_SECRET } from './constants'
import { asSchemaOwner } from './db'
import { signInAsSandboxUser } from './sessions'
import { expect, test } from './test'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.49' } })

test.describe('activity log', () => {
  test('shows who did what to which entity, newest first, and passes axe', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/team')
    await page.getByRole('button', { name: 'Actions for Priya Nair' }).click()
    await page.getByRole('menuitem', { name: 'Make viewer' }).click()
    await expect(page.getByRole('region', { name: 'Notifications' }).getByText('Priya Nair is now a viewer.')).toBeVisible()
    await page.goto('/activity')
    await expect(page.getByRole('heading', { level: 1, name: 'Activity' })).toBeVisible()
    await expect(page).toHaveTitle('Activity · Formline Admin')
    const table = page.getByRole('table', { name: 'Activity' })
    const newest = table.getByRole('row').nth(1)
    await expect(newest).toContainText('Dana Ortiz')
    await expect(newest).toContainText("Changed a member's role")
    await expect(newest).toContainText('Priya Nair')
    await expect(newest).toContainText('Manager → Viewer')
    await expect(table.getByRole('row').last()).toContainText('Entered the demo')
    await expectNoSeriousA11yViolationsInBothThemes(page)
  })

  test('filters by action, by the system and by period, and clears the filters', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    const order = await asSchemaOwner(async c => (await c.query<{ id: string; number: number }>('select id, number from fa.orders where workspace_id = $1 order by number limit 1', [workspaceId])).rows[0]!)
    await asSchemaOwner(c => c.query(
      "insert into fa.activity_log (workspace_id, action, entity_type, entity_id, details, at) values ($1, 'order.status_changed', 'order', $2, $3, now() - interval '40 days')",
      [workspaceId, order.id, JSON.stringify({ number: order.number, from: 'paid', to: 'processing' })]))
    await page.goto('/activity')
    const table = page.getByRole('table', { name: 'Activity' })
    await expect(table.getByRole('row')).toHaveCount(3)
    await page.getByLabel('Who', { exact: true }).selectOption('system')
    await expect(page).toHaveURL(/\/activity\?actor=system$/)
    await expect(table.getByRole('row')).toHaveCount(2)
    await expect(table.getByRole('row').nth(1)).toContainText('System')
    await expect(table.getByRole('row').nth(1).getByRole('link', { name: `#${order.number}` })).toHaveAttribute('href', `/orders/${order.number}`)
    await page.getByLabel('When', { exact: true }).selectOption('30d')
    await expect(page.getByRole('heading', { name: 'No entries' })).toBeVisible()
    await page.getByRole('link', { name: 'Clear filters' }).first().click()
    await expect(page).toHaveURL(/\/activity$/)
    await page.getByLabel('Action', { exact: true }).selectOption('sandbox.created')
    await expect(page).toHaveURL(/\/activity\?action=sandbox\.created$/)
    await expect(table.getByRole('row')).toHaveCount(2)
    await expect(page.getByText('1 of 2 entries')).toBeVisible()
  })

  test('speaks Russian and is not there for a manager', async ({ page, context, browser }) => {
    await signInAsSandboxUser(context)
    await page.goto('/activity?lang=ru')
    await expect(page.getByRole('heading', { level: 1, name: 'Журнал' })).toBeVisible()
    await expect(page.getByRole('table', { name: 'Журнал' }).getByRole('row').last()).toContainText('Вход в демо')
    const other = await browser.newContext({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.49' } })
    await signInAsSandboxUser(other, 'manager')
    const managerPage = await other.newPage()
    await managerPage.goto('/activity')
    await expect(managerPage.getByRole('heading', { level: 1, name: /not found/ })).toBeVisible()
    await other.close()
  })
})
