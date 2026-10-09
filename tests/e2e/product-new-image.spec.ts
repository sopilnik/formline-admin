import type { Page } from '@playwright/test'
import sharp from 'sharp'
import { E2E_ORIGIN_SECRET } from './constants'
import { signInAsSandboxUser } from './sessions'
import { expect, test } from './test'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.57' } })

const poster = async () => ({
  name: 'salt-flat.png', mimeType: 'image/png',
  buffer: await sharp({ create: { width: 640, height: 905, channels: 3, background: '#c9b28f' } }).png().toBuffer(),
})
const field = (page: Page) => page.getByRole('group', { name: 'Image' })

async function fillProduct(page: Page, name: string): Promise<void> {
  await page.goto('/products/new')
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Base price, $').fill('24')
  await page.getByLabel('Ink', { exact: true }).check()
}

// The image is chosen in the form and sent to the product once it exists (W.9; spec §8.4: no image without a product).
test.describe('new product image', () => {
  test('creates the product and gives it the image chosen in the form', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await fillProduct(page, 'Salt Flat')
    await field(page).locator('input[type="file"]').setInputFiles(await poster())
    await expect(field(page).locator('img')).toHaveAttribute('src', /^blob:/)
    await expect(field(page)).toContainText('salt-flat.png')

    await page.getByRole('button', { name: 'Create product' }).click()
    await expect(page).toHaveURL(/\/products\/salt-flat$/)
    await expect(page.getByRole('region', { name: 'Messages' }).getByText('Product created.')).toBeVisible()
    const shown = page.getByRole('region', { name: 'Image' }).locator('img')
    await expect(shown).toHaveAttribute('src', /^\/media\/[0-9a-f-]{36}$/)
    await expect.poll(() => shown.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBe(640)
  })

  test('takes a dropped image, and can let it go again', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await fillProduct(page, 'Dropped Light')
    const bytes = [...(await poster()).buffer]
    const dropped = await page.evaluateHandle(data => {
      const transfer = new DataTransfer()
      transfer.items.add(new File([new Uint8Array(data)], 'dropped.png', { type: 'image/png' }))
      return transfer
    }, bytes)
    await field(page).getByText('Drop an image here or').dispatchEvent('drop', { dataTransfer: dropped })
    await expect(field(page).locator('img')).toHaveAttribute('src', /^blob:/)
    await expect(field(page)).toContainText('dropped.png')

    await field(page).getByRole('button', { name: 'Remove image' }).click()
    await expect(field(page).locator('img')).toHaveCount(0)
    await expect(field(page).getByRole('button', { name: 'Choose image' })).toBeVisible()
  })

  test('says what is wrong with a file before anything is sent', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await fillProduct(page, 'Too Heavy')
    const picker = field(page).locator('input[type="file"]')
    await picker.setInputFiles({ name: 'big.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(2 * 1024 * 1024 + 10, 1) })
    await expect(field(page).getByRole('alert')).toHaveText('The file is larger than 2 MB.')
    await picker.setInputFiles({ name: 'drawing.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') })
    await expect(field(page).getByRole('alert')).toHaveText('Choose a JPEG, PNG or WebP image.')
    await expect(field(page).locator('img')).toHaveCount(0)
  })

  test('keeps the product when the server refuses the image, and says so', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await fillProduct(page, 'Cracked Glass')
    await field(page).locator('input[type="file"]').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: (await poster()).buffer.subarray(0, 100) })
    await page.getByRole('button', { name: 'Create product' }).click()

    await expect(page).toHaveURL(/\/products\/cracked-glass$/)
    await expect(page.getByRole('region', { name: 'Messages' }).getByText('The product is created, but its image was not uploaded: The image could not be read. It may be damaged.')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Image' }).getByText('No image')).toBeVisible()
  })
})
