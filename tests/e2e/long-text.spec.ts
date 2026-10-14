import sharp from 'sharp'
import type { Page } from '@playwright/test'
import { E2E_ORIGIN_SECRET } from './constants.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.64' } })

/** Whether the page fits its width: text that cannot wrap pushes it sideways (WCAG 2.2, 1.4.10). */
const pageWidth = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth)

const box = async (page: Page, locator: ReturnType<Page['locator']>) => (await locator.boundingBox())!

test.describe('long unbroken text', () => {
  test('an order note with a long id wraps inside its card at 390 and at 1280 px', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/orders')
    await page.getByRole('table', { name: 'Orders' }).getByRole('link', { name: /^#\d+$/ }).first().click()
    const token = `ref=${'A'.repeat(87)}`
    await page.getByLabel('Internal note').fill(`Refunded the shipping. Stripe session cs_test_a1B2c3D4e5F6g7H8i9J0kLmNoPqRsTuVwXyZ0123456789 ${token}`)
    await page.getByRole('button', { name: 'Add note' }).click()
    const history = page.getByRole('region', { name: 'History' })
    const note = history.getByText(token, { exact: false })
    await expect(note).toBeVisible()
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await pageWidth(page), String(width)).toBeLessThanOrEqual(width)
      const card = await box(page, history)
      const text = await box(page, note)
      expect(text.x + text.width, String(width)).toBeLessThanOrEqual(card.x + card.width)
    }
  })

  test('a collection named with one long word wraps on Collections and in Revenue by collection', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/collections/new')
    const name = `Ü${'W'.repeat(78)}Z`
    await page.getByLabel('Name').fill(name)
    await page.getByLabel('Slug').fill('long-name')
    await page.getByRole('button', { name: 'Create collection' }).click()
    await expect(page).toHaveURL(/\/collections\/long-name$/)
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/collections')
      await expect(page.getByRole('link', { name })).toBeVisible()
      expect(await pageWidth(page), `collections ${width}`).toBeLessThanOrEqual(width)
      await page.goto('/overview')
      await expect(page.getByRole('region', { name: 'Revenue by collection' }).getByText(name)).toBeVisible()
      expect(await pageWidth(page), `overview ${width}`).toBeLessThanOrEqual(width)
    }
  })

  test('a one-word product name wraps beside its status badge in the phone list', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/products/new')
    const name = 'Donaudampfschifffahrtsgesellschaftskapitaensmuetzenabzeichenherstellungsbetrieb'
    await page.getByLabel('Name').fill(name)
    await page.getByLabel('Slug').fill('donau-poster')
    await page.getByLabel('Base price, $').fill('35')
    await page.getByLabel('Ink', { exact: true }).check()
    await page.getByRole('button', { name: 'Create product' }).click()
    await expect(page).toHaveURL(/\/products\/donau-poster$/)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/products?status=draft')
    const card = page.getByRole('list', { name: 'Products' }).getByRole('listitem').filter({ hasText: name })
    const link = await box(page, card.getByRole('link', { name }))
    const badge = await box(page, card.getByText('Draft', { exact: true }))
    expect(link.x + link.width).toBeLessThanOrEqual(badge.x)
    expect(await pageWidth(page)).toBeLessThanOrEqual(390)
  })

  test('a tall image stays short enough to keep its buttons in view', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/products/hush')
    const image = page.getByRole('region', { name: 'Image' })
    const tall = await sharp({ create: { width: 400, height: 1600, channels: 3, background: '#a9cdb2' } }).png().toBuffer()
    await image.locator('input[type="file"]').setInputFiles({ name: 'tall.png', mimeType: 'image/png', buffer: tall })
    await expect(page.getByRole('region', { name: 'Messages' }).getByText('Image updated.')).toBeVisible()
    await expect.poll(() => image.locator('img').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBe(400)
    const shown = await box(page, image.locator('img'))
    expect(shown.height).toBeLessThanOrEqual(384)
    expect(shown.width / shown.height).toBeCloseTo(400 / 1600, 2)
    await expect(image.getByRole('button', { name: 'Replace image' })).toBeInViewport()
  })

  test('the image buttons stand one under the other in both languages', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    for (const [lang, replace, remove] of [['en', 'Replace image', 'Remove image'], ['ru', 'Заменить изображение', 'Убрать изображение']]) {
      await page.goto(`/products/hush?lang=${lang}`)
      const first = await box(page, page.getByRole('button', { name: replace }))
      const second = await box(page, page.getByRole('button', { name: remove }))
      expect(second.y, lang).toBeGreaterThanOrEqual(first.y + first.height)
      expect(Math.round(second.x), lang).toBe(Math.round(first.x))
    }
  })
})
