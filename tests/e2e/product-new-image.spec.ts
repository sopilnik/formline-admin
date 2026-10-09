import type { Page } from '@playwright/test'
import sharp from 'sharp'
import { E2E_ORIGIN_SECRET } from './constants'
import { navigationsTo } from './navigations'
import { signInAsSandboxUser } from './sessions'
import { expect, test } from './test'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.57' } })

const poster = async () => ({
  name: 'salt-flat.png', mimeType: 'image/png',
  buffer: await sharp({ create: { width: 640, height: 905, channels: 3, background: '#c9b28f' } }).png().toBuffer(),
})
const field = (page: Page) => page.getByRole('group', { name: 'Image' })

/** Holds the image upload, as a slow connection would, until the test lets it go. */
async function holdUpload(page: Page): Promise<() => void> {
  let release = (): void => {}
  const held = new Promise<void>(resolve => {
    release = resolve
  })
  await page.route(/\/api\/media\?product=/, async route => {
    await held
    await route.continue()
  })
  return release
}

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

  test('keeps the chosen image when a later file is refused', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await fillProduct(page, 'Second Thought')
    const picker = field(page).locator('input[type="file"]')
    await picker.setInputFiles(await poster())
    await expect(field(page).locator('img')).toHaveAttribute('src', /^blob:/)

    await picker.setInputFiles({ name: 'big.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(2 * 1024 * 1024 + 10, 1) })
    await expect(field(page).getByRole('alert')).toHaveText('The file is larger than 2 MB.')
    await expect(field(page).locator('img')).toHaveAttribute('src', /^blob:/)
    await expect(field(page)).toContainText('salt-flat.png')
  })

  test('does not light up for a file dragged over it while the image uploads', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    const release = await holdUpload(page)
    await fillProduct(page, 'Still Water')
    await field(page).locator('input[type="file"]').setInputFiles(await poster())
    const frame = field(page).locator('img').locator('xpath=..')
    const clear = 'rgba(0, 0, 0, 0)'
    await frame.dispatchEvent('dragover')
    await expect(frame).not.toHaveCSS('background-color', clear)
    await frame.dispatchEvent('dragleave')
    await expect(frame).toHaveCSS('background-color', clear)

    await page.getByRole('button', { name: 'Create product' }).click()
    await expect(page.getByRole('button', { name: 'Uploading the image…' })).toBeDisabled()
    await frame.dispatchEvent('dragover')
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)))
    await expect(frame).toHaveCSS('background-color', clear)

    release()
    await expect(page).toHaveURL(/\/products\/still-water$/)
  })

  test('keeps the product when the server refuses the image, and says so', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await fillProduct(page, 'Cracked Glass')
    await field(page).locator('input[type="file"]').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: (await poster()).buffer.subarray(0, 100) })
    await page.getByRole('button', { name: 'Create product' }).click()

    await expect(page).toHaveURL(/\/products\/cracked-glass$/)
    await expect(page.getByRole('region', { name: 'Messages' }).getByText('The product was created, but its image was not uploaded. The image could not be read. It may be damaged.')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Image' }).getByText('No image')).toBeVisible()
  })

  test('keeps the form as typed while the image uploads', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    const release = await holdUpload(page)
    await fillProduct(page, 'Slow Tide')
    await field(page).locator('input[type="file"]').setInputFiles(await poster())
    await page.getByRole('button', { name: 'Create product' }).click()

    await expect(page.getByRole('button', { name: 'Uploading the image…' })).toBeDisabled()
    await expect(page.getByLabel('Name')).toHaveValue('Slow Tide')
    await expect(page.getByLabel('Base price, $')).toHaveValue('24')
    await expect(page.getByLabel('Ink', { exact: true })).toBeChecked()

    release()
    await expect(page).toHaveURL(/\/products\/slow-tide$/)
  })

  test('lets the owner go elsewhere while the image uploads, and leaves them there', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    const release = await holdUpload(page)
    await fillProduct(page, 'Night Ferry')
    await field(page).locator('input[type="file"]').setInputFiles(await poster())
    await page.getByRole('button', { name: 'Create product' }).click()
    await expect(page.getByRole('button', { name: 'Uploading the image…' })).toBeVisible()

    await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: /^Orders/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Orders' })).toBeVisible()

    // Once the upload ends the form refreshes the page in view instead of opening the product.
    const visits = navigationsTo(page, '/products/night-ferry')
    const refreshed = page.waitForRequest(request => new URL(request.url()).pathname === '/orders' && new URL(request.url()).searchParams.has('_rsc'))
    release()
    await expect(page.getByRole('region', { name: 'Messages' }).getByText('Product created.')).toBeVisible()
    await (await refreshed).response()
    expect(visits).toEqual([])
    await expect(page).toHaveURL(/\/orders$/)
  })
})
