import { E2E_DEMO_COOKIE, E2E_ORIGIN_SECRET, E2E_SESSION_COOKIE } from './constants.ts'
import { asSchemaOwner } from './db.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

// One reset and one entry per run from this address.
test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.22' } })

const workspaceExists = (workspaceId: string) =>
  asSchemaOwner(async c => (await c.query('select 1 from fa.workspaces where id = $1', [workspaceId])).rowCount === 1)

test.describe('sandbox life', () => {
  test('the banner states the rule and Reset data gives a fresh copy', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    await page.goto('/overview')
    const banner = page.getByRole('region', { name: 'Demo sandbox' })
    await expect(banner).toContainText('Demo sandbox. Your changes are private. The sandbox is deleted after 2 hours without activity, or after 24 hours at the latest.')
    await banner.getByRole('button', { name: 'Reset data' }).click()
    const dialog = page.getByRole('dialog', { name: 'Reset the sandbox?' })
    await expect(dialog).toContainText('Everything you changed is deleted and a fresh copy is created.')
    await dialog.getByRole('button', { name: 'Reset', exact: true }).click()
    await expect(page).toHaveURL(/\/overview$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
    await expect.poll(() => workspaceExists(workspaceId)).toBe(false)
    expect((await context.cookies()).find(c => c.name === E2E_DEMO_COOKIE)?.value).toBe('1')
  })

  test('at 375 px the banner keeps one line and its actions sit in an overflow menu', async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 740 })
    await signInAsSandboxUser(context)
    await page.goto('/overview')
    const banner = page.getByRole('region', { name: 'Demo sandbox' })
    await expect(banner.getByRole('button', { name: 'Reset data' })).toBeHidden()
    await banner.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: 'Reset data' }).click()
    await expect(page.getByRole('dialog', { name: 'Reset the sandbox?' })).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    const box = await banner.boundingBox()
    expect(box!.width).toBeLessThanOrEqual(375)
    expect(box!.height).toBeLessThan(60)
  })

  test('a visitor whose sandbox has ended lands on the sign-in page with the notice, never an error', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    await page.goto('/overview')
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
    await asSchemaOwner(c => c.query("update fa.workspaces set expires_at = now() - interval '1 second' where id = $1", [workspaceId]))
    await page.goto('/overview')
    await expect(page).toHaveURL(/\/sign-in\?ended=1$/)
    await expect(page.getByText('Your demo sandbox has ended. Start a new one.')).toBeVisible()
    await page.getByRole('button', { name: 'Enter the demo' }).click()
    await expect(page).toHaveURL(/\/overview$/)
  })

  test('signing out asks first and then deletes the sandbox', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    await page.goto('/overview')
    await page.getByRole('button', { name: /^Account menu: / }).click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    const dialog = page.getByRole('dialog', { name: 'Sign out and end the demo?' })
    await expect(dialog).toContainText('Your sandbox and everything you changed in it are deleted.')
    await dialog.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/sign-in$/)
    await expect.poll(() => workspaceExists(workspaceId)).toBe(false)
    const names = (await context.cookies()).map(c => c.name)
    expect(names).not.toContain(E2E_SESSION_COOKIE)
    expect(names).not.toContain(E2E_DEMO_COOKIE)
    await page.goto('/overview')
    await expect(page).toHaveURL(/\/sign-in$/)
  })
})
