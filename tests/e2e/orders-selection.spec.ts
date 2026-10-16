import type { Locator } from '@playwright/test'
import { E2E_ORIGIN_SECRET } from './constants.ts'
import { openFramed } from './ready.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.67' } })

const center = async (target: Locator) => {
  const box = (await target.boundingBox())!

  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** Whether a point of the page shows the element itself (or something inside it), not a layer over it. */
const reachable = async (target: Locator) => {
  const { x, y } = await center(target)

  return target.evaluate((element, [px, py]) => element.contains(document.elementFromPoint(px!, py!)), [x, y])
}

test.describe('the orders selection', () => {
  test('keeps the column headers in the table, and says why "Change status" cannot be used', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/orders?status=cancelled,refunded')
    await page.getByRole('table', { name: 'Orders' }).getByRole('checkbox', { name: /^Select order #/ }).first().check()

    const headers = await page.getByRole('table', { name: 'Orders' }).locator('thead th').allTextContents()

    expect(headers.slice(1)).toEqual(['Order', 'Placed', 'Customer', 'Source', 'Status', 'Items', 'Total'])

    const change = page.getByRole('toolbar', { name: 'Selected orders' }).getByRole('button', { name: 'Change status' })

    await expect(change).toBeDisabled()
    await expect(change).toHaveAccessibleDescription('Canceled and refunded orders keep their status.')
  })

  test('on a phone the floating bar leaves the pager and the page size in reach at the end of the list', async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signInAsSandboxUser(context)
    await openFramed(page, '/orders')

    const cards = page.getByRole('list', { name: 'Orders' })

    await cards.getByRole('checkbox', { name: /^Select order #/ }).nth(0).check()
    await cards.getByRole('checkbox', { name: /^Select order #/ }).nth(1).check()
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))

    for (const target of [page.getByRole('link', { name: 'Next page' }), page.locator('#orders-page-size')]) {
      await expect.poll(() => reachable(target)).toBe(true)
    }
  })

  test('every status chip is a stop of its own in the Tab order, and its ring shows whole at 390 px', async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signInAsSandboxUser(context)
    await openFramed(page, '/orders')

    const chips = page.getByRole('group', { name: 'Status' }).getByRole('button')

    await expect(chips).toHaveCount(7)

    await chips.first().focus()

    for (let i = 1; i < 7; i++) {
      await page.keyboard.press('Tab')

      await expect(chips.nth(i)).toBeFocused()
    }

    // The focused chip scrolls into view, and its 2 px ring at a 2 px offset stays inside the row that scrolls.
    const inside = await chips.last().evaluate(el => {
      const reach = 4
      const row = el.parentElement!.getBoundingClientRect()
      const box = el.getBoundingClientRect()

      return box.left - reach >= row.left && box.right + reach <= row.right
    })

    expect(inside).toBe(true)
  })

  test('on a phone the chip row scrolls without a bar, and its chips clear the faded edges at either end', async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signInAsSandboxUser(context)
    await openFramed(page, '/orders')

    const row = page.getByRole('group', { name: 'Status' })

    await expect(row).toHaveCSS('scrollbar-width', 'none')
    await expect(row).toHaveCSS('mask-image', /^linear-gradient\(90deg, rgba\(0, 0, 0, 0\), /)

    // The left fade covers the page's 16 px gutter: at the start the first chip stands after it.
    const first = await row.getByRole('button').first().evaluate(el => el.getBoundingClientRect().left - el.parentElement!.getBoundingClientRect().left)

    expect(first).toBeGreaterThanOrEqual(16)

    // The right fade covers the last 40 px of the row; scrolled to the end, the last chip stops before it.
    await row.evaluate(el => el.scrollTo({ left: el.scrollWidth }))

    const clear = await row.getByRole('button').last().evaluate(el => el.parentElement!.getBoundingClientRect().right - el.getBoundingClientRect().right)

    expect(clear).toBeGreaterThanOrEqual(40)
  })
})
