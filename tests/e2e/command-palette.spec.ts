import type { Page } from '@playwright/test'
import { expectNoSeriousA11yViolationsInBothThemes } from './a11y.ts'
import { E2E_ORIGIN_SECRET } from './constants.ts'
import { asSchemaOwner } from './db.ts'
import { openFramed } from './ready.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.51' } })

const palette = (page: Page) => page.getByRole('dialog', { name: 'Search and commands' })
const input = (page: Page) => page.getByRole('combobox', { name: 'Search pages, actions, orders, customers and products' })
const group = (page: Page, name: string) => palette(page).getByRole('group', { name })

test.describe('command palette', () => {
  test('opens with Ctrl+K, finds an order by its number and opens it with Enter', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    const { rows } = await asSchemaOwner(c => c.query<{ number: number; name: string }>(
      `select o.number, c.name from fa.orders o join fa.customers c on c.workspace_id = o.workspace_id and c.id = o.customer_id
        where o.workspace_id = $1 order by o.placed_at limit 1`, [workspaceId]))
    const { number, name } = rows[0]!
    await openFramed(page, '/overview')
    await expect(page.getByRole('button', { name: 'Search…' })).toHaveAttribute('aria-keyshortcuts', 'Control+K')
    await page.keyboard.press('Control+k')
    await expect(palette(page)).toBeVisible()
    await expect(input(page)).toBeFocused()
    await expect(group(page, 'Pages').getByRole('option')).toHaveCount(9)
    await expectNoSeriousA11yViolationsInBothThemes(page, '[role="dialog"][aria-label="Search and commands"]')
    await input(page).fill(`#${number}`)
    const order = group(page, 'Orders').getByRole('option', { name: new RegExp(`^#${number} · ${name}`) })
    await expect(order).toBeVisible()
    await expect(group(page, 'Pages')).toHaveCount(0)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/orders/${number}$`))
    await expect(palette(page)).toBeHidden()
  })

  test('filters the pages and actions as one types and goes to a page from the search button', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/overview')
    await page.getByRole('button', { name: 'Search…' }).click()
    await input(page).fill('cust')
    await expect(group(page, 'Pages').getByRole('option')).toHaveText(['Customers'])
    await group(page, 'Pages').getByRole('option', { name: 'Customers' }).click()
    await expect(page).toHaveURL(/\/customers$/)
  })

  test('finds a customer by a part of the name', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    const { rows } = await asSchemaOwner(c => c.query<{ id: string; name: string }>(
      'select id, name from fa.customers where workspace_id = $1 order by name limit 1', [workspaceId]))
    await openFramed(page, '/orders')
    await page.getByRole('searchbox').focus()
    await page.keyboard.press('Control+k')
    await input(page).fill(rows[0]!.name.split(' ')[1]!)
    await group(page, 'Customers').getByRole('option', { name: new RegExp(`^${rows[0]!.name}`) }).click()
    await expect(page).toHaveURL(new RegExp(`/customers/${rows[0]!.id}$`))
  })

  test('offers each role only its own actions, and a sandbox\'s sign-out asks first', async ({ page, context }) => {
    await signInAsSandboxUser(context, 'viewer')
    await openFramed(page, '/overview')
    await page.keyboard.press('Control+k')
    const actions = group(page, 'Actions').getByRole('option')
    await expect(actions).toHaveText(['Follow the system theme', 'Use the light theme', 'Use the dark theme', 'Switch to Russian', 'Keyboard shortcuts', 'Sign out'])
    await expect(group(page, 'Pages').getByRole('option', { name: 'Team' })).toHaveCount(0)
    await actions.filter({ hasText: 'Sign out' }).click()
    await expect(page.getByRole('dialog', { name: 'Sign out and end the demo?' })).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page).toHaveURL(/\/overview$/)
  })

  test('an owner may start a product or an invitation, and switch the theme and the language', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/overview')
    await page.keyboard.press('Control+k')
    await expect(group(page, 'Actions').getByRole('option', { name: 'New product' })).toBeVisible()
    await group(page, 'Actions').getByRole('option', { name: 'Invite a member' }).click()
    await expect(page).toHaveURL(/\/team#team-invite$/)
    await page.keyboard.press('Control+k')
    await group(page, 'Actions').getByRole('option', { name: 'Use the dark theme' }).click()
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    await page.keyboard.press('Control+k')
    await input(page).fill('russ')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Поиск…' })).toBeVisible()
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('dialog', { name: 'Поиск и команды' }).getByRole('group', { name: 'Страницы' })).toBeVisible()
  })

  test('says so when nothing matches, and fits a phone', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.setViewportSize({ width: 375, height: 740 })
    await page.goto('/overview')
    await expect(page.getByRole('button', { name: 'Search…' })).toBeVisible()
    await page.getByRole('button', { name: 'Search…' }).click()
    await input(page).fill('zzqx')
    await expect(palette(page).getByText('Nothing found for “zzqx”.')).toBeVisible()
    const box = (await palette(page).boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(375)
    await page.keyboard.press('Escape')
    await expect(palette(page)).toBeHidden()
  })
})
