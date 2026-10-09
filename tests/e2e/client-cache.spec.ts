import type { Page } from '@playwright/test'
import { E2E_ORIGIN_SECRET } from './constants'
import { signInAsSandboxUser } from './sessions'
import { expect, test } from './test'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.56' } })

/** Collects the page-data requests that navigations to `path` make from now on; prefetches are left out. */
function navigationsTo(page: Page, path: string): string[] {
  const seen: string[] = []
  page.on('request', request => {
    const url = new URL(request.url())
    if (url.pathname === path && url.searchParams.has('_rsc') && !request.headers()['next-router-prefetch']) seen.push(url.href)
  })
  return seen
}

// The browser keeps a visited page for 60 seconds (W.1, `staleTimes` in next.config.ts); an own change must clear it.
test.describe('client cache', () => {
  test('a section opened a moment ago opens again without asking the server', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/overview')
    const menu = page.getByRole('navigation', { name: 'Main menu' })

    await menu.getByRole('link', { name: /^Orders/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Orders' })).toBeVisible()
    await menu.getByRole('link', { name: 'Products' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Products' })).toBeVisible()

    const requests = navigationsTo(page, '/orders')
    await menu.getByRole('link', { name: /^Orders/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Orders' })).toBeVisible()
    expect(requests).toEqual([])
  })

  test('an own change clears it, so a page opened a moment ago shows the change', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/overview')
    const menu = page.getByRole('navigation', { name: 'Main menu' })
    await menu.getByRole('link', { name: 'Products' }).click()
    const row = page.getByRole('table', { name: 'Products' }).getByRole('row').filter({ hasText: 'Far Orbit' })
    await expect(row).not.toContainText('Archived')

    await row.getByRole('link', { name: 'Far Orbit' }).click()
    await page.getByRole('button', { name: 'Change status' }).click()
    await page.getByRole('menuitem', { name: 'Archive' }).click()
    await expect(page.getByRole('region', { name: 'Messages' }).getByText('Far Orbit is archived.')).toBeVisible()

    const requests = navigationsTo(page, '/products')
    await menu.getByRole('link', { name: 'Products' }).click()
    await expect(row).toContainText('Archived')
    expect(requests).not.toEqual([])
  })

  test('a new product is in the list opened a moment ago', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/overview')
    const menu = page.getByRole('navigation', { name: 'Main menu' })
    await menu.getByRole('link', { name: 'Products' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Products' })).toBeVisible()

    await page.getByRole('link', { name: 'New product' }).click()
    await page.getByLabel('Name').fill('Short Lived')
    await page.getByLabel('Base price, $').fill('20')
    await page.getByLabel('Paper', { exact: true }).check()
    await page.getByRole('button', { name: 'Create product' }).click()
    await expect(page).toHaveURL(/\/products\/short-lived$/)

    await menu.getByRole('link', { name: 'Products' }).click()
    await expect(page.getByRole('table', { name: 'Products' }).getByRole('link', { name: 'Short Lived' })).toBeVisible()
  })

  test('a new slug is what the list opened a moment ago links to', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/overview')
    const menu = page.getByRole('navigation', { name: 'Main menu' })
    await menu.getByRole('link', { name: 'Products' }).click()
    const table = page.getByRole('table', { name: 'Products' })
    await table.locator('a[href="/products/sparse"]').click()

    const details = page.getByRole('region', { name: 'Details' })
    await details.getByLabel('Slug').fill('sparse-grid')
    await details.getByRole('button', { name: 'Save changes' }).click()
    await expect(page).toHaveURL(/\/products\/sparse-grid$/)

    await menu.getByRole('link', { name: 'Products' }).click()
    await expect(table.locator('a[href="/products/sparse-grid"]')).toBeVisible()
  })

  test('a new collection is in the list opened a moment ago', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/overview')
    const menu = page.getByRole('navigation', { name: 'Main menu' })
    await menu.getByRole('link', { name: 'Collections' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Collections' })).toBeVisible()

    await page.getByRole('link', { name: 'New collection' }).click()
    await page.getByLabel('Name').fill('Deep Sea')
    await page.getByRole('button', { name: 'Create collection' }).click()
    await expect(page).toHaveURL(/\/collections\/deep-sea$/)

    await menu.getByRole('link', { name: 'Collections' }).click()
    await expect(page.getByRole('list', { name: 'Collections' }).getByRole('link', { name: 'Deep Sea' })).toBeVisible()
  })

  test('a new collection slug is what the list opened a moment ago links to', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/overview')
    const menu = page.getByRole('navigation', { name: 'Main menu' })
    await menu.getByRole('link', { name: 'Collections' }).click()
    const list = page.getByRole('list', { name: 'Collections' })
    await list.locator('a[href="/collections/night"]').click()

    await page.getByLabel('Slug').fill('night-sky')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page).toHaveURL(/\/collections\/night-sky$/)

    await menu.getByRole('link', { name: 'Collections' }).click()
    await expect(list.locator('a[href="/collections/night-sky"]')).toBeVisible()
  })

  test('an opened notification is read on the page opened a moment ago', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/overview')
    const bell = page.getByRole('button', { name: /^Notifications/ })
    await bell.click()
    await page.getByRole('link', { name: 'All notifications' }).click()
    await expect(page.getByText('8 unread · 8 notifications')).toBeVisible()

    await bell.click()
    await page.getByRole('list', { name: 'Latest notifications' }).getByRole('listitem').first().getByRole('button').click()
    await expect(page).toHaveURL(/\/orders\/\d+$/)

    await bell.click()
    await page.getByRole('link', { name: 'All notifications' }).click()
    await expect(page.getByText('7 unread · 8 notifications')).toBeVisible()
  })
})
