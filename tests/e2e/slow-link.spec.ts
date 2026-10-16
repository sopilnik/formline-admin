import sharp from 'sharp'
import type { Page } from '@playwright/test'
import { E2E_ORIGIN_SECRET } from './constants.ts'
import { openFramed } from './ready.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.66' } })

const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Main menu' })

/** Holds the requests a matcher picks for a while, as a slow connection would. */
type Hold = { url: string | RegExp; ms: number; pick?: (headers: Record<string, string>) => boolean }

async function hold(page: Page, { url, ms, pick = () => true }: Hold): Promise<void> {
  await page.route(url, async route => {
    if (pick(route.request().headers())) {
      await new Promise(resolve => setTimeout(resolve, ms))
    }

    await route.fallback()
  })
}

test.describe('a slow link', () => {
  test('a navigation during an image upload goes through at once', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/products/hush')
    await hold(page, { url: '**/api/media?**', ms: 6000 })

    const poster = await sharp({ create: { width: 600, height: 800, channels: 3, background: '#a9cdb2' } }).png().toBuffer()

    await page.getByRole('region', { name: 'Image' }).locator('input[type="file"]').setInputFiles({ name: 'poster.png', mimeType: 'image/png', buffer: poster })

    await expect(page.getByRole('button', { name: 'Uploading…' })).toBeVisible()

    await sidebar(page).getByRole('link', { name: /^Orders/ }).click()

    await expect(page).toHaveURL(/\/orders$/, { timeout: 3000 })
    // The upload still ends, and says so on the page the person went on to.
    await expect(page.getByRole('region', { name: 'Messages' }).getByText('Image updated.')).toBeVisible({ timeout: 10_000 })
  })

  test('a navigation during a CSV export goes through at once', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/orders')
    await hold(page, { url: '**/api/orders/export**', ms: 5000 })
    await page.getByRole('button', { name: /^Export [\d,]+ as CSV$/ }).click()
    await sidebar(page).getByRole('link', { name: 'Customers' }).click()

    await expect(page).toHaveURL(/\/customers$/, { timeout: 3000 })
  })

  test('Team, Activity, an order and the new-product form show their own loading state at once', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    // Links prefetch the loading state of their pages (an order's once the pointer reaches it); the pages are held, not that.
    await hold(page, {
      url: /\/(team|activity|orders\/\d+|products\/new)(\?|$)/,
      ms: 1500,
      pick: headers => headers.rsc === '1' && headers['next-router-prefetch'] === undefined,
    })

    const loading = (text: string) => page.getByRole('status').filter({ hasText: text })

    await openFramed(page, '/orders')

    const order = page.getByRole('table', { name: 'Orders' }).getByRole('link', { name: /^#\d+$/ }).first()

    await order.hover()
    await page.waitForLoadState('networkidle')
    await order.click()

    await expect(loading('Loading the order…')).toBeAttached()
    await expect(loading('Loading orders…')).toHaveCount(0)

    await page.waitForLoadState('networkidle')
    await sidebar(page).getByRole('link', { name: 'Team' }).click()

    await expect(loading('Loading the team…')).toBeAttached()

    await page.waitForLoadState('networkidle')
    await sidebar(page).getByRole('link', { name: 'Activity' }).click()

    await expect(loading('Loading the activity log…')).toBeAttached()

    await openFramed(page, '/products')
    await page.waitForLoadState('networkidle')
    await page.getByRole('link', { name: 'New product' }).click()

    await expect(loading('Loading the new product form…')).toBeAttached()
    await expect(loading('Loading products…')).toHaveCount(0)
  })

  test('Settings opens its first section in one step and stays current on every section', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/overview')

    const settings = sidebar(page).getByRole('link', { name: 'Settings' })

    await expect(settings).toHaveAttribute('href', '/settings/profile')

    await openFramed(page, '/settings/store')

    await expect(sidebar(page).getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page')
  })
})
