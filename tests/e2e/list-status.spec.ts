import type { Page } from '@playwright/test'
import { E2E_ORIGIN_SECRET } from './constants.ts'
import { openFramed } from './ready.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.62' } })

/** The frame's polite region that says a list's results; it lives across the list's navigations. */
const said = (page: Page) => page.getByTestId('list-status')

test.describe('list results said aloud', () => {
  test('a search, a status chip and a page change on Orders each say the new results', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/orders')

    await expect(said(page)).toHaveRole('status')
    // A list met on a new page is read with the page: nothing is said for it yet.
    await expect(said(page)).toHaveText('')

    await page.getByRole('searchbox', { name: 'Search orders' }).fill('qqqzzz')
    await page.getByRole('searchbox', { name: 'Search orders' }).press('Enter')

    await expect(said(page)).toHaveText(/^0 of [\d,]+ orders\. No orders match these filters$/)

    await page.getByRole('link', { name: 'Clear filters' }).first().click()

    await expect(said(page)).toHaveText(/^[\d,]+ orders\. 1–25 of [\d,]+$/)

    await page.getByRole('button', { name: /^Shipped, \d+$/ }).click()

    await expect(said(page)).toHaveText(/^\d+ of [\d,]+ orders\. 1–\d+ of \d+$/)

    await page.getByRole('link', { name: 'Next page' }).click()

    await expect(said(page)).toHaveText(/^\d+ of [\d,]+ orders\. 26–\d+ of \d+$/)
  })

  test('a search on Customers and on Products says what it found', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/customers')
    await page.getByRole('searchbox').fill('qqqzzz')
    await page.getByRole('searchbox').press('Enter')

    await expect(said(page)).toHaveText(/^0 of [\d,]+ customers\. No customers match this search$/)

    await openFramed(page, '/products')
    await page.getByRole('searchbox').fill('qqqzzz')
    await page.getByRole('searchbox').press('Enter')

    await expect(said(page)).toHaveText(/^0 of \d+ products\. No products match these filters$/)
  })

  test('a list marks itself busy while a filter loads', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/orders')

    const list = page.getByRole('main').locator('section').filter({ has: page.getByRole('table', { name: 'Orders' }) })

    // The next page of results is held back a second, as a slow connection would.
    await page.route('**/orders?*', async route => {
      if (route.request().headers().rsc) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      await route.continue()
    })

    await page.getByRole('button', { name: /^Shipped, \d+$/ }).click()

    await expect(list).toHaveAttribute('aria-busy', 'true')
    await expect(list).not.toHaveAttribute('aria-busy')
  })

  test('the palette says what it found, and marks the highlighted option selected', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/overview')
    await page.keyboard.press('Control+k')

    const palette = page.getByRole('dialog', { name: 'Search and commands' })
    const input = palette.getByRole('combobox')

    await input.fill('qqqzzz')

    await expect(palette.getByRole('status')).toHaveText('Nothing found for “qqqzzz”.')

    await input.fill('orders')

    await expect(palette.getByRole('status')).toHaveText(/^\d+ results?$/)

    const highlighted = palette.getByRole('option').first()

    await expect(highlighted).toHaveAttribute('aria-selected', 'true')
    await expect(palette.locator('[role="option"][aria-selected="true"]')).toHaveCount(1)
  })
})
