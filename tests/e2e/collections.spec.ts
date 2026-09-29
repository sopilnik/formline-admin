import { expectNoSeriousA11yViolationsInBothThemes } from './a11y'
import { E2E_ORIGIN_SECRET } from './constants'
import { signInAsSandboxUser } from './sessions'
import { expect, test } from './test'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.35' } })

const names = (page: import('@playwright/test').Page) => page.getByRole('list', { name: 'Collections' }).getByRole('listitem').getByRole('link')

test.describe('collections', () => {
  test('lists the collections with their products, reorders them and keeps the focus on the moved one', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/collections')
    await expect(page.getByRole('heading', { level: 1, name: 'Collections' })).toBeVisible()
    await expect(names(page)).toHaveText(['Monochrome', 'Primary', 'Pastel', 'Night'])
    await expect(page.getByRole('listitem').filter({ hasText: 'Night' })).toContainText('4 products')
    await expect(page.getByRole('button', { name: 'Move Monochrome up' })).toBeDisabled()
    await expectNoSeriousA11yViolationsInBothThemes(page)
    await page.getByRole('button', { name: 'Move Pastel up' }).click()
    await expect(names(page)).toHaveText(['Monochrome', 'Pastel', 'Primary', 'Night'])
    await expect(page.getByRole('button', { name: 'Move Pastel up' })).toBeFocused()
    await expect(page.getByText('Pastel is now 2 of 4.')).toBeAttached()
    await page.keyboard.press('Enter')
    await expect(names(page)).toHaveText(['Pastel', 'Monochrome', 'Primary', 'Night'])
    await expect(page.getByRole('button', { name: 'Move Pastel down' })).toBeFocused()
    // The announcement comes with the server's answer: only then is the move stored.
    await expect(page.getByText('Pastel is now 1 of 4.')).toBeAttached()
    await page.reload()
    await expect(names(page)).toHaveText(['Pastel', 'Monochrome', 'Primary', 'Night'])
    await page.goto('/products')
    await expect(page.getByLabel('Collection', { exact: true }).locator('option')).toHaveText(['All collections', 'Pastel', 'Monochrome', 'Primary', 'Night'])
  })

  test('creates a collection, renames it and deletes it while it is empty', async ({ page, context }) => {
    await signInAsSandboxUser(context, 'manager')
    await page.goto('/collections')
    await page.getByRole('link', { name: 'New collection' }).click()
    await page.getByLabel('Name').fill('Deep Sea')
    await expect(page.getByLabel('Slug')).toHaveAttribute('placeholder', 'deep-sea')
    await page.getByRole('button', { name: 'Create collection' }).click()
    await expect(page).toHaveURL(/\/collections\/deep-sea$/)
    await expect(page.getByRole('region', { name: 'Notifications' }).getByText('Collection created.')).toBeVisible()
    await expect(page.getByText('No products are in this collection.')).toBeVisible()
    await page.getByLabel('Name').fill('Deeper Sea')
    await page.getByLabel('Slug').fill('deeper-sea')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page).toHaveURL(/\/collections\/deeper-sea$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Deeper Sea' })).toBeVisible()
    await page.getByRole('region', { name: 'Delete collection' }).getByRole('button', { name: 'Delete collection' }).click()
    await expect(page.getByRole('dialog', { name: 'Delete Deeper Sea?' })).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete collection' }).click()
    await expect(page).toHaveURL(/\/collections$/)
    await expect(page.getByRole('region', { name: 'Notifications' }).getByText('Deeper Sea deleted.')).toBeVisible()
    await expect(names(page)).toHaveText(['Monochrome', 'Primary', 'Pastel', 'Night'])
  })

  test('keeps a collection with products and shows a viewer no controls', async ({ page, context }) => {
    await signInAsSandboxUser(context, 'viewer')
    await page.goto('/collections')
    await expect(page.getByRole('link', { name: 'New collection' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Move / })).toHaveCount(0)
    await names(page).filter({ hasText: 'Night' }).click()
    await expect(page).toHaveURL(/\/collections\/night$/)
    await expect(page).toHaveTitle('Night · Formline Admin')
    await expect(page.getByRole('region', { name: 'Products' }).getByRole('link')).toHaveText(['After Dark', 'Far Orbit', 'Hush', 'Night Blocks'])
    await expect(page.getByRole('textbox')).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Delete collection' })).toHaveCount(0)
    await expectNoSeriousA11yViolationsInBothThemes(page)
  })

  test('explains why a collection with products stays', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/collections/night')
    await expect(page.getByRole('region', { name: 'Delete collection' })).toContainText('This collection holds 4 products.')
    await expect(page.getByRole('region', { name: 'Delete collection' }).getByRole('button')).toHaveCount(0)
  })
})
