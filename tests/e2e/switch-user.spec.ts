import { E2E_ORIGIN_SECRET } from './constants'
import { asSchemaOwner } from './db'
import { signInAsSandboxUser } from './sessions'
import { expect, test } from './test'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.23' } })

test.describe('switch user', () => {
  test('lists the other demo users and continues as the chosen one', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    await page.goto('/overview')
    await expect(page.getByRole('link', { name: 'Activity' })).toBeVisible()
    await page.getByRole('region', { name: 'Demo sandbox' }).getByRole('button', { name: 'Switch user' }).click()
    const dialog = page.getByRole('dialog', { name: 'Switch user' })
    await expect(dialog.getByRole('radio')).toHaveCount(3)
    for (const name of ['Noah Becker', 'Priya Nair', 'Tomás Ferreira']) await expect(dialog.getByText(name)).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Switch', exact: true })).toBeDisabled()
    await dialog.getByRole('radio', { name: /Tomás Ferreira/ }).check()
    await expect(dialog.getByLabel('Authenticator code')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Switch', exact: true }).click()
    await expect(page).toHaveURL(/\/overview$/)
    await expect(page.getByRole('button', { name: 'Account menu: Tomás Ferreira, Viewer' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Activity' })).toHaveCount(0)
    const log = await asSchemaOwner(async c => (await c.query("select 1 from fa.activity_log where workspace_id = $1 and action = 'sandbox.switched_user'", [workspaceId])).rowCount)
    expect(log).toBe(1)
  })

  test('at 375 px the switch lives in the overflow menu', async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 740 })
    await signInAsSandboxUser(context, 'viewer')
    await page.goto('/overview')
    await page.getByRole('region', { name: 'Demo sandbox' }).getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: 'Switch user' }).click()
    const dialog = page.getByRole('dialog', { name: 'Switch user' })
    await expect(dialog.getByText('Dana Ortiz')).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
  })
})
