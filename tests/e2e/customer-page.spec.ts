import { randomUUID } from 'node:crypto'
import { expectNoSeriousA11yViolationsInBothThemes } from './a11y'
import { E2E_ORIGIN_SECRET } from './constants'
import { asSchemaOwner } from './db'
import { signInAsSandboxUser } from './sessions'
import { expect, test } from './test'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.41' } })

/** The customer with the most orders in the sandbox, and their latest order's number. */
const busiest = (workspaceId: string) => asSchemaOwner(async c => (await c.query<{ id: string; name: string; email: string; orders: number; latest: number }>(
  `select c.id, c.name, c.email, count(o.id)::int as orders,
          (array_agg(o.number order by o.placed_at desc, o.id desc))[1] as latest
     from fa.customers c join fa.orders o on o.workspace_id = c.workspace_id and o.customer_id = c.id
    where c.workspace_id = $1 group by c.workspace_id, c.id order by count(o.id) desc, c.id limit 1`, [workspaceId])).rows[0]!)

test.describe('customer page', () => {
  test('shows the summary and the orders, links to them, and passes axe', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    const customer = await busiest(workspaceId)
    await page.goto(`/customers/${customer.id}`)
    await expect(page.getByRole('heading', { level: 1, name: customer.name })).toBeVisible()
    await expect(page).toHaveTitle(`${customer.name} · Formline Admin`)
    await expect(page.getByText(customer.email)).toBeVisible()
    const orders = page.getByRole('list', { name: 'Orders' })
    await expect(orders.getByRole('listitem')).toHaveCount(customer.orders)
    await expect(orders.getByRole('listitem').first().getByRole('link')).toHaveText(`#${customer.latest}`)
    await expect(page.getByRole('region', { name: 'Summary' })).toContainText(`Orders${customer.orders}`)
    await expectNoSeriousA11yViolationsInBothThemes(page)
    await page.getByRole('link', { name: `Show all ${customer.orders} in Orders` }).click()
    await expect(page).toHaveURL(new RegExp(`/orders\\?q=${encodeURIComponent(customer.email).replace(/\./g, '\\.')}$`))
    await expect(page.getByText(new RegExp(`^${customer.orders} of [\\d,]+ orders$`))).toBeVisible()
  })

  test('saves the notes, keeps them and logs the change', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context, 'manager')
    const customer = await busiest(workspaceId)
    await page.goto(`/customers/${customer.id}`)
    const field = page.getByLabel('Notes about this customer')
    await field.fill('Prefers express delivery.\nWraps every poster as a gift.')
    await page.getByRole('button', { name: 'Save notes' }).click()
    await expect(page.getByRole('region', { name: 'Notifications' }).getByText('Notes saved.')).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('Notes about this customer')).toHaveValue('Prefers express delivery.\nWraps every poster as a gift.')
    const entries = await asSchemaOwner(async c => (await c.query<{ n: number }>(
      "select count(*)::int as n from fa.activity_log where workspace_id = $1 and action = 'customer.notes_updated' and entity_id = $2", [workspaceId, customer.id])).rows[0]!.n)
    expect(entries).toBe(1)
  })

  test('shows a viewer the notes as text, without the form', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context, 'viewer')
    const customer = await busiest(workspaceId)
    await asSchemaOwner(c => c.query('update fa.customers set notes = $3 where workspace_id = $1 and id = $2', [workspaceId, customer.id, 'Asked for a paper invoice.']))
    await page.goto(`/customers/${customer.id}`)
    const notes = page.getByRole('region', { name: 'Notes', exact: true })
    await expect(notes).toContainText('Asked for a paper invoice.')
    await expect(notes.getByRole('textbox')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Save notes' })).toHaveCount(0)
    await expectNoSeriousA11yViolationsInBothThemes(page)
  })

  test('answers an unknown or malformed address with the not-found view', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    for (const id of [randomUUID(), 'not-a-customer']) {
      await page.goto(`/customers/${id}`)
      await expect(page.getByRole('heading', { level: 1, name: 'Customer not found' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'All customers' })).toHaveAttribute('href', '/customers')
    }
  })

  test('is reached from the list and from an order', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    const customer = await busiest(workspaceId)
    await page.goto(`/customers?q=${encodeURIComponent(customer.email)}`)
    await page.getByRole('table', { name: 'Customers' }).getByRole('link', { name: customer.name }).click()
    await expect(page).toHaveURL(new RegExp(`/customers/${customer.id}$`))
    await page.goto(`/orders/${customer.latest}`)
    await page.getByRole('link', { name: 'Customer page' }).click()
    await expect(page).toHaveURL(new RegExp(`/customers/${customer.id}$`))
    await expect(page.getByRole('heading', { level: 1, name: customer.name })).toBeVisible()
  })
})
