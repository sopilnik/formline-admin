import { expectNoSeriousA11yViolationsInBothThemes } from './a11y'
import { E2E_ORIGIN_SECRET } from './constants'
import { asSchemaOwner } from './db'
import { signInAsSandboxUser } from './sessions'
import { expect, test } from './test'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.44' } })

const actions = (workspaceId: string) => asSchemaOwner(async c => (await c.query<{ action: string; details: Record<string, string> }>(
  "select action, details from fa.activity_log where workspace_id = $1 and action like 'team.%' order by at", [workspaceId])).rows)

test.describe('team', () => {
  test('lists the members with their roles, two-factor and activity, and passes axe', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/team')
    await expect(page.getByRole('heading', { level: 1, name: 'Team' })).toBeVisible()
    await expect(page).toHaveTitle('Team · Formline Admin')
    await expect(page.getByText('4 members')).toBeVisible()
    const table = page.getByRole('table', { name: 'Members' })
    await expect(table.getByRole('row')).toHaveCount(5)
    await expect(table.getByRole('row').nth(1)).toContainText('Dana Ortiz')
    await expect(table.getByRole('row').nth(1)).toContainText('You')
    await expect(table.getByRole('row').nth(1).getByRole('button')).toHaveCount(0)
    await expect(table.getByRole('row').nth(3)).toContainText('Priya Nair')
    await expect(table.getByRole('row').nth(3)).toContainText('Manager')
    await expect(table.getByRole('row').nth(3)).toContainText('No activity yet')
    await expect(page.getByRole('link', { name: 'Team', exact: true })).toHaveAttribute('aria-current', 'page')
    await expectNoSeriousA11yViolationsInBothThemes(page)
  })

  test('changes a member’s role and logs it', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    await page.goto('/team')
    await page.getByRole('button', { name: 'Actions for Priya Nair' }).click()
    await page.getByRole('menuitem', { name: 'Make viewer' }).click()
    await expect(page.getByRole('region', { name: 'Messages' }).getByText('Priya Nair is now a viewer.')).toBeVisible()
    await expect(page.getByRole('table', { name: 'Members' }).getByRole('row').nth(3)).toContainText('Viewer')
    expect(await actions(workspaceId)).toEqual([{ action: 'team.role_changed', details: { name: 'Priya Nair', from: 'manager', to: 'viewer' } }])
  })

  test('deactivates a member after a confirmation, takes them out of the user switch, and reactivates them', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    await page.goto('/team')
    await page.getByRole('button', { name: 'Actions for Noah Becker' }).click()
    await page.getByRole('menuitem', { name: 'Deactivate…' }).click()
    const dialog = page.getByRole('dialog', { name: 'Deactivate Noah Becker?' })
    await expect(dialog).toBeVisible()
    // A title that wraps on a phone needs air between its lines: 16 px text on a 22 px line.
    await expect(dialog.getByRole('heading', { name: 'Deactivate Noah Becker?' })).toHaveCSS('line-height', '22px')
    await dialog.getByRole('button', { name: 'Deactivate' }).click()
    await expect(page.getByRole('region', { name: 'Messages' }).getByText('Noah Becker is deactivated.')).toBeVisible()
    const table = page.getByRole('table', { name: 'Members' })
    await expect(table.getByRole('row').last()).toContainText('Noah Becker')
    await expect(table.getByRole('row').last()).toContainText('Deactivated')
    await page.getByRole('button', { name: 'Switch user' }).click()
    const switcher = page.getByRole('dialog', { name: 'Switch user' })
    await expect(switcher.getByRole('radio')).toHaveCount(2)
    await expect(switcher.getByText('Noah Becker')).toHaveCount(0)
    await switcher.getByRole('button', { name: 'Cancel' }).click()
    await page.getByRole('button', { name: 'Actions for Noah Becker' }).click()
    await page.getByRole('menuitem', { name: 'Reactivate' }).click()
    await expect(page.getByRole('region', { name: 'Messages' }).getByText('Noah Becker is active again.')).toBeVisible()
    await expect(table.getByRole('row').nth(2)).not.toContainText('Deactivated')
    expect((await actions(workspaceId)).map(e => e.action)).toEqual(['team.deactivated', 'team.reactivated'])
  })

  test('lets an admin manage the others but not the owner or themselves', async ({ page, context }) => {
    await signInAsSandboxUser(context, 'admin')
    await page.goto('/team')
    await expect(page.getByRole('button', { name: /^Actions for / })).toHaveCount(2)
    await expect(page.getByRole('button', { name: 'Actions for Dana Ortiz' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Actions for Noah Becker' })).toHaveCount(0)
  })

  test('is not there for a manager', async ({ page, context }) => {
    await signInAsSandboxUser(context, 'manager')
    await page.goto('/overview')
    await expect(page.getByRole('link', { name: 'Team' })).toHaveCount(0)
    await page.goto('/team')
    await expect(page.getByRole('heading', { level: 1, name: /not found/ })).toBeVisible()
  })

  test('shows cards on a phone, with the actions at hand', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('/team')
    await expect(page.getByRole('table', { name: 'Members' })).toBeHidden()
    const cards = page.getByRole('list', { name: 'Members' }).getByRole('listitem')
    await expect(cards).toHaveCount(4)
    await expect(cards.nth(3).getByRole('button', { name: 'Actions for Tomás Ferreira' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  })
})
