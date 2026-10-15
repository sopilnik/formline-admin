import { expectNoSeriousA11yViolationsInBothThemes } from './a11y.ts'
import { E2E_ORIGIN_SECRET } from './constants.ts'
import { asSchemaOwner } from './db.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.26' } })

test.describe('selection and bulk status', () => {
  test('changes the valid orders, reports the skipped one and logs each change', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)

    // The three newest orders become paid, paid and delivered: the delivered one cannot go to processing.
    const newest = await asSchemaOwner(async c => (await c.query<{ id: string; number: number }>(
      'select id, number from fa.orders where workspace_id = $1 order by placed_at desc, id desc limit 3', [workspaceId])).rows)

    await asSchemaOwner(c => c.query(
      "update fa.orders set status = case when id = $2 then 'delivered' else 'paid' end where workspace_id = $1 and id = any($3)",
      [workspaceId, newest[2]!.id, newest.map(o => o.id)]))

    await page.goto('/orders')

    const table = page.getByRole('table', { name: 'Orders' })
    const toolbar = page.getByRole('toolbar', { name: 'Selected orders' })
    const firstRow = table.getByRole('row').nth(1)
    const placedCell = firstRow.getByRole('cell').nth(2)
    const before = (await placedCell.boundingBox())!

    for (const order of newest) await table.getByRole('checkbox', { name: `Select order #${order.number}` }).check()
    await expect(table.getByRole('checkbox', { name: 'Select all orders on this page' })).toHaveAttribute('aria-checked', 'mixed')
    await expect(toolbar.getByText('3 selected')).toBeVisible()
    // The toolbar lies over the header row: the headers stay in the table and still name its cells.
    await expect(table.getByRole('columnheader', { name: 'Placed' })).toBeAttached()

    const header = (await table.locator('thead').boundingBox())!
    const bar = (await toolbar.boundingBox())!

    expect([Math.round(bar.y), Math.round(bar.height)]).toEqual([Math.round(header.y), Math.round(header.height)])

    // Nothing moves under the pointer: the toolbar takes no room and the columns keep their widths.
    const after = (await placedCell.boundingBox())!

    expect([after.x, after.y]).toEqual([before.x, before.y])

    await toolbar.getByRole('button', { name: 'Change status' }).click()
    await expect(page.getByRole('menuitem')).toHaveText(['Processing', 'Canceled', 'Refunded'])
    await page.getByRole('menuitem', { name: 'Processing' }).click()
    await expect(page.getByText('2 orders changed to Processing.')).toBeVisible()
    await expect(page.getByText(`Skipped #${newest[2]!.number}: not allowed from its status.`)).toBeVisible()
    await expect(table.getByRole('columnheader', { name: 'Placed' })).toBeVisible()
    await expect(firstRow.getByText('Processing', { exact: true })).toBeVisible()

    const statuses = await asSchemaOwner(async c => (await c.query<{ status: string }>(
      'select status from fa.orders where workspace_id = $1 and id = any($2) order by placed_at desc, id desc', [workspaceId, newest.map(o => o.id)])).rows.map(r => r.status))

    expect(statuses).toEqual(['processing', 'processing', 'delivered'])

    const logged = await asSchemaOwner(async c => (await c.query("select 1 from fa.activity_log where workspace_id = $1 and action = 'order.status_changed'", [workspaceId])).rowCount)

    expect(logged).toBe(2)
  })

  test('selects the whole page from the header and clears the selection', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/orders')

    const table = page.getByRole('table', { name: 'Orders' })
    const boxes = table.getByRole('checkbox', { name: /^Select order #/ })

    await table.getByRole('checkbox', { name: 'Select all orders on this page' }).check()
    await expect(page.getByRole('toolbar', { name: 'Selected orders' }).getByText('25 selected')).toBeVisible()
    await expect(boxes.first()).toBeChecked()
    await expect(boxes.last()).toBeChecked()
    await page.getByRole('toolbar', { name: 'Selected orders' }).getByRole('button', { name: 'Clear selection' }).click()
    await expect(table.getByRole('columnheader', { name: 'Placed' })).toBeVisible()
    await expect(boxes.first()).not.toBeChecked()
  })

  test('a viewer can select but is not offered a status change', async ({ page, context }) => {
    await signInAsSandboxUser(context, 'viewer')
    await page.goto('/orders')

    const table = page.getByRole('table', { name: 'Orders' })

    await table.getByRole('checkbox', { name: /^Select order #/ }).first().check()
    await expect(page.getByRole('toolbar', { name: 'Selected orders' }).getByText('1 selected')).toBeVisible()
    await expect(page.getByRole('toolbar', { name: 'Selected orders' }).getByRole('button', { name: 'Change status' })).toHaveCount(0)
    await expectNoSeriousA11yViolationsInBothThemes(page)
  })

  test('on a phone the bulk bar floats at the bottom of the screen', async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 740 })
    await signInAsSandboxUser(context)
    await page.goto('/orders')

    const cards = page.getByRole('list', { name: 'Orders' })

    await cards.getByRole('checkbox', { name: /^Select order #/ }).first().check()

    const bar = page.getByRole('region', { name: 'Selected orders' })

    await expect(bar.getByText('1 selected')).toBeVisible()

    const box = (await bar.boundingBox())!

    expect(box.y + box.height).toBeGreaterThan(740 - 40)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(375)
    await expectNoSeriousA11yViolationsInBothThemes(page)
  })
})
