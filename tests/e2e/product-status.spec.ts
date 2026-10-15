import { expectNoSeriousA11yViolationsInBothThemes } from './a11y.ts'
import { E2E_ORIGIN_SECRET } from './constants.ts'
import { asSchemaOwner } from './db.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.34' } })

test.describe('product status and deletion', () => {
  test('archives a product with orders instead of deleting it, and brings it back as a draft', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)

    await page.goto('/products/far-orbit')

    const remove = page.getByRole('region', { name: 'Delete product' })

    await expect(remove).toContainText('This product has orders, so it cannot be deleted.')
    await expect(remove.getByRole('button')).toHaveCount(0)
    await page.getByRole('button', { name: 'Change status' }).click()
    await page.getByRole('menuitem', { name: 'Archive' }).click()
    await expect(page.getByRole('region', { name: 'Messages' }).getByText('Far Orbit is archived.')).toBeVisible()
    await expect(page.getByText('Archived', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Change status' }).click()
    await expect(page.getByRole('menuitem')).toHaveText(['Move to drafts'])
    await page.keyboard.press('Escape')
    await page.goto('/products?status=archived')
    await expect(page.getByRole('table', { name: 'Products' }).getByRole('link', { name: 'Far Orbit' })).toBeVisible()

    const logged = await asSchemaOwner(async c => (await c.query<{ details: { from: string; to: string } }>(
      "select details from fa.activity_log where workspace_id = $1 and action = 'product.status_changed'", [workspaceId])).rows)

    expect(logged.map(l => [l.details.from, l.details.to])).toEqual([['published', 'archived']])
  })

  test('deletes a new draft after a confirmation that names it', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/products/new')
    await page.getByLabel('Name').fill('Short Lived')
    await page.getByLabel('Base price, $').fill('20')
    await page.getByLabel('Paper', { exact: true }).check()
    await page.getByRole('button', { name: 'Create product' }).click()
    await expect(page).toHaveURL(/\/products\/short-lived$/)
    await expect(page).toHaveTitle('Short Lived · Formline Admin')
    await page.getByRole('region', { name: 'Delete product' }).getByRole('button', { name: 'Delete product' }).click()

    const dialog = page.getByRole('dialog', { name: 'Delete Short Lived?' })

    await expect(dialog).toContainText('The product and its 3 variants are deleted.')
    await expectNoSeriousA11yViolationsInBothThemes(page)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    await page.getByRole('region', { name: 'Delete product' }).getByRole('button', { name: 'Delete product' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete product' }).click()
    await expect(page).toHaveURL(/\/products$/)
    await expect(page.getByRole('region', { name: 'Messages' }).getByText('Short Lived deleted.')).toBeVisible()
    await page.goto('/products/short-lived')
    await expect(page.getByRole('heading', { name: 'Product not found' })).toBeVisible()
  })

  test('publishes a draft', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context, 'manager')

    await asSchemaOwner(c => c.query("update fa.products set status = 'draft' where workspace_id = $1 and slug = 'hush'", [workspaceId]))
    await page.goto('/products/hush')
    await expect(page.getByRole('region', { name: 'Delete product' })).toContainText('This product has orders')
    await page.getByRole('button', { name: 'Change status' }).click()
    await page.getByRole('menuitem', { name: 'Publish' }).click()
    await expect(page.getByText('Published', { exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Messages' }).getByText('Hush is published.')).toBeVisible()
  })

  test('shows a viewer the status only', async ({ page, context }) => {
    await signInAsSandboxUser(context, 'viewer')
    await page.goto('/products/hush')
    await expect(page.getByText('Published', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Change status' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Delete product' })).toHaveCount(0)
  })
})
