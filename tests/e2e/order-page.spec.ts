import { expectNoSeriousA11yViolationsInBothThemes } from './a11y.ts'
import { E2E_ORIGIN_SECRET } from './constants.ts'
import { asSchemaOwner } from './db.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.28' } })

type Row = { id: string; number: number; name: string; city: string; total_cents: number }

const newestPaid = (workspaceId: string) => asSchemaOwner(async c => (await c.query<Row>(
  "select o.id, o.number, c.name, c.city, o.total_cents from fa.orders o join fa.customers c on c.workspace_id = o.workspace_id and c.id = o.customer_id where o.workspace_id = $1 and o.status = 'paid' order by o.placed_at desc limit 1",
  [workspaceId])).rows[0]!)

const money = (cents: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol' }).format(cents / 100)

test.describe('order page', () => {
  test('opens from the list and shows the lines, the totals, the customer, the address and the history', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context, 'viewer')
    const order = await newestPaid(workspaceId)
    const lines = await asSchemaOwner(async c => (await c.query('select 1 from fa.order_lines where workspace_id = $1 and order_id = $2', [workspaceId, order.id])).rowCount!)
    await page.goto('/orders?status=paid')
    await page.getByRole('table', { name: 'Orders' }).getByRole('link', { name: `#${order.number}` }).click()
    await expect(page).toHaveURL(new RegExp(`/orders/${order.number}$`))
    await expect(page.getByRole('heading', { level: 1, name: `Order #${order.number}` })).toBeVisible()
    await expect(page).toHaveTitle(`Order #${order.number} · Formline Admin`)
    await expect(page.getByRole('region', { name: 'Items' }).getByRole('table')).toHaveAccessibleName('')   // the section names it, once
    await expect(page.getByRole('region', { name: 'Items' }).getByRole('row')).toHaveCount(lines + 1)   // the header and one row per line
    await expect(page.getByRole('region', { name: 'Items' }).getByRole('definition').last()).toHaveText(money(order.total_cents))
    await expect(page.getByRole('region', { name: 'Customer' }).getByText(order.name)).toBeVisible()
    await expect(page.getByRole('region', { name: 'Shipping address' }).getByText(order.city, { exact: false })).toBeVisible()
    const history = page.getByRole('region', { name: 'History' })
    await expect(history.getByRole('listitem').first()).toContainText('Status set to Paid')
    await expect(history.getByRole('listitem').first()).toContainText('System')
    await expect(page.getByRole('button', { name: 'Change status' })).toHaveCount(0)
    await expect(page.getByLabel('Internal note')).toHaveCount(0)
    await expectNoSeriousA11yViolationsInBothThemes(page)
  })

  test('changes the status at once, writes the history and the log, and moves the sidebar count', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    const order = await newestPaid(workspaceId)
    const toProcess = await asSchemaOwner(async c => Number((await c.query<{ n: string }>("select count(*) as n from fa.orders where workspace_id = $1 and status = 'paid'", [workspaceId])).rows[0]!.n))
    await page.goto(`/orders/${order.number}`)
    await page.getByRole('button', { name: 'Change status' }).click()
    await expect(page.getByRole('menuitem')).toHaveText(['Processing', 'Cancelled', 'Refunded'])
    await page.getByRole('menuitem', { name: 'Processing' }).click()
    await expect(page.getByText(`Order #${order.number} is now Processing.`)).toBeVisible()
    await expect(page.getByRole('main').getByText('Processing', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('region', { name: 'History' }).getByRole('listitem').last()).toContainText('Paid → Processing')
    await expect(page.getByRole('region', { name: 'History' }).getByRole('listitem').last()).toContainText('Dana Ortiz')
    await expect(page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: `Orders, ${toProcess - 1} to process` })).toBeVisible()
    const logged = await asSchemaOwner(async c => (await c.query("select 1 from fa.activity_log where workspace_id = $1 and action = 'order.status_changed' and entity_id = $2", [workspaceId, order.id])).rowCount)
    expect(logged).toBe(1)
  })

  test('rolls back with a message when the order moved on in the meantime', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    const order = await newestPaid(workspaceId)
    await page.goto(`/orders/${order.number}`)
    await asSchemaOwner(c => c.query("update fa.orders set status = 'cancelled' where workspace_id = $1 and id = $2", [workspaceId, order.id]))
    await page.getByRole('button', { name: 'Change status' }).click()
    await page.getByRole('menuitem', { name: 'Processing' }).click()
    // Base UI announces an error toast through a separate alert and hides the visible copy from the accessibility tree.
    await expect(page.getByRole('region', { name: 'Messages' }).getByText('This order changed while the page was open. It now shows its current status.')).toBeVisible()
    await expect(page.getByRole('main').getByText('Cancelled', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Change status' })).toHaveCount(0)   // nothing follows "cancelled"
  })

  test('adds an internal note to the history and says when the note is empty', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context, 'manager')
    const order = await newestPaid(workspaceId)
    await page.goto(`/orders/${order.number}`)
    const field = page.getByLabel('Internal note')
    await page.getByRole('button', { name: 'Add note' }).click()
    await expect(page.getByText('Write the note first.')).toBeVisible()
    await expect(field).toBeFocused()
    await field.fill('Customer asked for a gift wrap.')
    await page.getByRole('button', { name: 'Add note' }).click()
    const last = page.getByRole('region', { name: 'History' }).getByRole('listitem').last()
    await expect(last).toContainText('Customer asked for a gift wrap.')
    await expect(last).toContainText('Priya Nair')
    await expect(field).toHaveValue('')
  })

  test('flags a line the catalog does not know', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    const order = await newestPaid(workspaceId)
    await asSchemaOwner(c => c.query('update fa.order_lines set unmatched = true, variant_id = null, sku = null where workspace_id = $1 and order_id = $2', [workspaceId, order.id]))
    await page.goto(`/orders/${order.number}`)
    const items = page.getByRole('region', { name: 'Items' }).getByRole('table')
    await expect(items.getByText('Not in the catalog').first()).toBeVisible()
    await expect(items.getByRole('link')).toHaveCount(0)
  })

  test('says so inside the frame when the number is not an order', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/orders/999999')
    await expect(page.getByRole('heading', { level: 1, name: 'Order not found' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeVisible()
    await page.getByRole('main').getByRole('link', { name: 'All orders' }).click()
    await expect(page).toHaveURL(/\/orders$/)
  })
})
