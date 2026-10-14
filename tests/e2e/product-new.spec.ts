import { expectNoSeriousA11yViolationsInBothThemes } from './a11y.ts'
import { E2E_ORIGIN_SECRET } from './constants.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.32' } })

test.describe('new product', () => {
  test('creates a draft from the list and opens its page', async ({ page, context }) => {
    await signInAsSandboxUser(context, 'manager')
    await page.goto('/products')
    await page.getByRole('link', { name: 'New product' }).click()
    await expect(page).toHaveURL(/\/products\/new$/)
    await expect(page.getByRole('heading', { level: 1, name: 'New product' })).toBeVisible()
    await expectNoSeriousA11yViolationsInBothThemes(page)
    await page.getByLabel('Name').fill('Tide Pool')
    await expect(page.getByLabel('Slug')).toHaveAttribute('placeholder', 'tide-pool')
    await page.getByLabel('Collection').selectOption({ label: 'Pastel' })
    await page.getByLabel('Base price, $').fill('27')
    await page.getByLabel('Sage', { exact: true }).check()
    await page.getByLabel('Sand', { exact: true }).check()
    await page.getByRole('button', { name: 'Create product' }).click()
    await expect(page).toHaveURL(/\/products\/tide-pool$/)
    await expect(page.getByRole('region', { name: 'Messages' }).getByText('Product created.')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Tide Pool' })).toBeVisible()
    await expect(page.getByText('Draft', { exact: true })).toBeVisible()
    const variants = page.getByRole('region', { name: 'Variants' })
    await expect(variants.getByRole('group')).toHaveCount(6)
    await expect(variants.getByRole('group', { name: 'A3 · Sage' })).toContainText('tide-pool-a3-sage')
    await expect(variants.getByRole('group', { name: 'A3 · Sage' })).toContainText('Sold out')
    await page.goto('/products?status=draft')
    await expect(page.getByRole('table', { name: 'Products' }).getByRole('link', { name: 'Tide Pool' })).toBeVisible()
  })

  test('keeps what was typed and ticked when the form has problems', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/products/new')
    await page.getByLabel('Name').fill('Far Orbit')
    await page.getByLabel('Base price, $').fill('abc')
    await page.getByRole('button', { name: 'Create product' }).click()
    await expect(page.getByText('Enter a price from 0.01 to 9959.99. The largest size costs $40 more.')).toBeVisible()
    await expect(page.getByText('Choose at least one palette.')).toBeVisible()
    await expect(page.getByLabel('Base price, $')).toBeFocused()
    await page.getByLabel('Base price, $').fill('31')
    await page.getByLabel('Ink', { exact: true }).check()
    await page.getByRole('button', { name: 'Create product' }).click()
    await expect(page.getByText('Another product already has this slug.')).toBeVisible()
    await expect(page.getByLabel('Slug')).toBeFocused()
    await expect(page.getByLabel('Ink', { exact: true })).toBeChecked()
    await expect(page.getByLabel('Name')).toHaveValue('Far Orbit')
  })

  test('is not offered to a viewer', async ({ page, context }) => {
    await signInAsSandboxUser(context, 'viewer')
    await page.goto('/products')
    await expect(page.getByRole('heading', { level: 1, name: 'Products' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'New product' })).toHaveCount(0)
    await page.goto('/products/new')
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  })
})
