import { createHash, randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { expectNoSeriousA11yViolationsInBothThemes } from './a11y.ts'
import { E2E_ORIGIN_SECRET } from './constants.ts'
import { asSchemaOwner } from './db.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.50' } })

const bell = (page: Page) => page.getByRole('button', { name: /^(Notifications|Уведомления)/ })
const latest = (page: Page) => page.getByRole('list', { name: 'Latest notifications' }).getByRole('listitem')

async function newestOrder(workspaceId: string): Promise<number> {
  const { rows } = await asSchemaOwner(c => c.query<{ number: number }>(
    'select number from fa.orders where workspace_id = $1 order by placed_at desc, id desc limit 1', [workspaceId]))
  return rows[0]!.number
}

test.describe('notifications', () => {
  test('the bell counts a new sandbox\'s eight and lists the latest six, newest first', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    const number = await newestOrder(workspaceId)
    await page.goto('/overview')
    await expect(bell(page)).toHaveAccessibleName('Notifications, 8 unread')
    await bell(page).click()
    await expect(page.getByRole('dialog', { name: 'Notifications' })).toBeVisible()
    await expect(latest(page)).toHaveCount(6)
    await expect(latest(page).first()).toContainText(`New order #${number}`)
    await expect(latest(page).first()).toContainText('Unread')
    await expect(page.getByRole('link', { name: 'All notifications' })).toBeVisible()
    await expectNoSeriousA11yViolationsInBothThemes(page, '[data-slot="notifications-popup"]')
  })

  test('opening a notification marks it read and opens its order', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context, 'manager')
    const number = await newestOrder(workspaceId)
    await page.goto('/overview')
    await bell(page).click()
    await latest(page).first().getByRole('button').click()
    await expect(page).toHaveURL(new RegExp(`/orders/${number}$`))
    await expect(page.getByRole('heading', { level: 1, name: `Order #${number}` })).toBeVisible()
    await expect(bell(page)).toHaveAccessibleName('Notifications, 7 unread')
    await expect(page.getByRole('dialog', { name: 'Notifications' })).toBeHidden()
  })

  test('a stock notification opens its product under the slug it has now', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context, 'viewer')
    const { rows } = await asSchemaOwner(c => c.query<{ slug: string }>(
      `update fa.products p set slug = p.slug || '-new' from fa.notifications n
        where n.workspace_id = $1 and n.kind = 'stock.low' and p.workspace_id = n.workspace_id and p.id = (n.payload->>'productId')::uuid
          and n.created_at = (select max(created_at) from fa.notifications where workspace_id = $1 and kind = 'stock.low')
        returning p.slug`, [workspaceId]))
    await page.goto('/overview')
    await bell(page).click()
    await latest(page).filter({ hasText: 'Low stock:' }).first().getByRole('button').click()
    await expect(page).toHaveURL(new RegExp(`/products/${rows[0]!.slug}$`))
  })

  test('marks everything read from the bell, and the page agrees', async ({ page, context }) => {
    await signInAsSandboxUser(context, 'admin')
    await page.goto('/overview')
    await bell(page).click()
    await page.getByRole('button', { name: 'Mark all as read' }).click()
    await expect(bell(page)).toHaveAccessibleName('Notifications')
    await expect(latest(page).getByText('Unread')).toHaveCount(0)
    await page.getByRole('link', { name: 'All notifications' }).click()
    await expect(page).toHaveURL(/\/notifications$/)
    await expect(page.getByText('All read · 8 notifications')).toBeVisible()
  })

  test('the page lists every notification with its count, marks them read and passes axe', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/notifications')
    await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible()
    await expect(page).toHaveTitle('Notifications · Formline Admin')
    await expect(page.getByText('8 unread · 8 notifications')).toBeVisible()
    const entries = page.getByRole('list', { name: 'Notifications' }).getByRole('listitem')
    await expect(entries).toHaveCount(8)
    await expect(page.getByRole('region', { name: 'Notifications' })).toHaveCount(0)   // the list carries the name, once
    await expect(entries.filter({ hasText: 'Low stock:' })).toHaveCount(3)
    await expectNoSeriousA11yViolationsInBothThemes(page)
    await page.getByRole('button', { name: 'Mark all as read' }).click()
    await expect(page.getByText('All read · 8 notifications')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mark all as read' })).toHaveCount(0)
    await expect(bell(page)).toHaveAccessibleName('Notifications')
  })

  test('a two-digit count sits at the bell\'s corner and leaves most of the bell in view', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    // Two more "Low stock" for every member: the new sandbox's eight become ten.
    await asSchemaOwner(c => c.query(
      `insert into fa.notifications (workspace_id, user_id, kind, payload)
       select workspace_id, null, kind, payload from fa.notifications where workspace_id = $1 and kind = 'stock.low' limit 2`, [workspaceId]))
    await page.goto('/overview')
    await expect(bell(page)).toHaveAccessibleName('Notifications, 10 unread')
    await expect(bell(page).locator('span[aria-hidden]')).toHaveText('10')
    const covered = await bell(page).evaluate(button => {
      const icon = button.querySelector('svg')!.getBoundingClientRect()
      const count = button.querySelector('span')!.getBoundingClientRect()
      const width = Math.max(0, Math.min(icon.right, count.right) - Math.max(icon.left, count.left))
      const height = Math.max(0, Math.min(icon.bottom, count.bottom) - Math.max(icon.top, count.top))
      return (width * height) / (icon.width * icon.height)
    })
    expect(covered, 'the share of the bell under the count').toBeLessThanOrEqual(0.3)
  })

  test('the count follows a navigation without a reload', async ({ page, context }) => {
    const { workspaceId, userId } = await signInAsSandboxUser(context)
    await page.goto('/overview')
    await expect(bell(page)).toHaveAccessibleName('Notifications, 8 unread')
    await asSchemaOwner(c => c.query(
      `insert into fa.notification_reads (workspace_id, notification_id, user_id)
       select workspace_id, id, $2 from fa.notifications where workspace_id = $1 and kind = 'stock.low'`, [workspaceId, userId]))
    await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Orders' }).click()
    await expect(page).toHaveURL(/\/orders$/)
    await expect(bell(page)).toHaveAccessibleName('Notifications, 5 unread')
  })

  test('the device that signed in sees its own sign-in as such and does not count it', async ({ page, context }) => {
    const { token, workspaceId, userId } = await signInAsSandboxUser(context)
    await asSchemaOwner(async c => {
      const own = await c.query<{ sign_in_id: string }>('select sign_in_id from fa.sessions where id = $1', [createHash('sha256').update(token).digest('hex')])
      const insert = (signIn: string, minutes: number) => c.query(
        "insert into fa.notifications (workspace_id, user_id, kind, payload, created_at) values ($1, $2, 'auth.new_sign_in', $3, now() - make_interval(mins => $4))",
        [workspaceId, userId, JSON.stringify({ device: 'Firefox, Linux', signIn }), minutes])
      await insert(own.rows[0]!.sign_in_id, 1)
      await insert(randomUUID(), 2)
    })
    await page.goto('/overview')
    await expect(bell(page)).toHaveAccessibleName('Notifications, 9 unread')
    await bell(page).click()
    const signIns = latest(page).filter({ hasText: 'New sign-in to your account' })
    await expect(signIns).toHaveCount(2)
    await expect(signIns.nth(0)).toContainText('This device')
    await expect(signIns.nth(0)).not.toContainText('Unread')
    await expect(signIns.nth(1)).not.toContainText('This device')
    await expect(signIns.nth(1)).toContainText('Unread')
    await expect(signIns.nth(1)).toContainText('From Firefox, Linux')
  })

  test('speaks Russian and stays inside a phone screen', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    const number = await newestOrder(workspaceId)
    await page.setViewportSize({ width: 375, height: 740 })
    await page.goto('/overview?lang=ru')
    await expect(bell(page)).toHaveAccessibleName('Уведомления, 8 непрочитанных')
    await bell(page).click()
    const popup = page.getByRole('dialog', { name: 'Уведомления' })
    await expect(popup).toBeVisible()
    const items = page.getByRole('list', { name: 'Последние уведомления' }).getByRole('listitem')
    await expect(items.first()).toContainText(`Новый заказ #${number}`)
    await expect(items.first()).toContainText(/\d,\d\d\s\$/)
    await expect(items.filter({ hasText: 'Мало на складе:' }).first()).toContainText(/— осталось \d, порог \d/)
    const box = (await popup.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(375)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  })
})
