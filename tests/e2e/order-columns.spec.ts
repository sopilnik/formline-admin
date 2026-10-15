import type { Locator } from '@playwright/test'
import { E2E_ORIGIN_SECRET } from './constants.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.59' }, viewport: { width: 1440, height: 900 } })

/** Each row's room beside its status chip: to the text of the column before and of the column after, in pixels. */
const roomBesideStatus = (table: Locator, status: number) => table.evaluate((element, index) => {
  const text = (cell: Element) => {
    const range = document.createRange()

    range.selectNodeContents(cell)

    return range.getBoundingClientRect()
  }

  return [...element.querySelectorAll('tbody tr')].map(row => {
    const cells = row.children
    const chip = cells[index]!.firstElementChild!.getBoundingClientRect()
    const cell = cells[index]!.getBoundingClientRect()
    // The source is an element with an icon, whose text range misreads; a plain text cell is measured by its text.
    const before = cells[index - 1]!.firstElementChild?.getBoundingClientRect() ?? text(cells[index - 1]!)

    return { left: chip.left - before.right, right: text(cells[index + 1]!).left - chip.right, offCenter: (chip.left + chip.right) / 2 - (cell.left + cell.right) / 2 }
  })
}, status)

// The numbers come last, right-aligned, and the status chip stands midway between its neighbours.
test.describe('order columns', () => {
  test('the orders list: Source, Status, Items, Total, the chip midway between the source and the count', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/orders')

    const table = page.getByRole('table', { name: 'Orders' })

    await expect(table.getByRole('row').nth(1)).toBeVisible()
    expect((await table.getByRole('row').first().getByRole('columnheader').allTextContents()).slice(1).map(text => text.trim()))
      .toEqual(['Order', 'Placed', 'Customer', 'Source', 'Status', 'Items', 'Total'])

    for (const room of await roomBesideStatus(table, 5)) expect(Math.abs(room.left - room.right)).toBeLessThanOrEqual(8)
  })

  test('the latest orders: Status, then Total, the chip centered in the spare room', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/overview')

    const table = page.getByRole('table', { name: 'Latest orders' })

    await expect(table.getByRole('row').nth(1)).toBeVisible()
    expect((await table.getByRole('columnheader').allTextContents()).map(text => text.trim())).toEqual(['Order', 'Placed', 'Customer', 'Status', 'Total'])

    const widths = await table.getByRole('columnheader').evaluateAll(headers => headers.map(th => th.getBoundingClientRect().width))

    expect(widths[3]).toBeGreaterThan(widths[2]!)
    for (const room of await roomBesideStatus(table, 3)) expect(Math.abs(room.offCenter)).toBeLessThanOrEqual(1)
  })
})
