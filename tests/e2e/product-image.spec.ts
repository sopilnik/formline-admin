import sharp from 'sharp'
import { expectNoSeriousA11yViolationsInBothThemes } from './a11y.ts'
import { E2E_BASE_URL, E2E_DEMO_COOKIE, E2E_ORIGIN_SECRET, E2E_SESSION_COOKIE } from './constants.ts'
import { asSchemaOwner, createSandboxSession } from './db.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

const EDGE = { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.37' }
test.use({ extraHTTPHeaders: EDGE })

const poster = async () => ({
  name: 'tide-pool.png', mimeType: 'image/png',
  buffer: await sharp({ create: { width: 720, height: 1018, channels: 3, background: '#a9cdb2' } }).png().toBuffer(),
})

const image = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Image' })

test.describe('product image', () => {
  test('creates a product with an image, shows it in the list and serves it to its workspace only', async ({ page, context, browser }) => {
    await signInAsSandboxUser(context)
    await page.goto('/products/new')
    await page.getByLabel('Name').fill('Tide Pool')
    await page.getByLabel('Base price, $').fill('27')
    await page.getByLabel('Sage', { exact: true }).check()
    await page.getByRole('button', { name: 'Create product' }).click()
    await expect(page).toHaveURL(/\/products\/tide-pool$/)
    await expect(image(page).getByText('No image')).toBeVisible()
    await image(page).locator('input[type="file"]').setInputFiles(await poster())
    await expect(page.getByRole('region', { name: 'Messages' }).getByText('Image updated.')).toBeVisible()
    const shown = image(page).locator('img')
    await expect(shown).toHaveAttribute('src', /^\/media\/[0-9a-f-]{36}$/)
    await expect.poll(() => shown.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBe(720)
    await expect(image(page).getByRole('button', { name: 'Replace image' })).toBeVisible()
    await expectNoSeriousA11yViolationsInBothThemes(page)
    const src = (await shown.getAttribute('src'))!

    const served = await page.evaluate(async url => {
      const response = await fetch(url)
      return { status: response.status, type: response.headers.get('content-type'), cache: response.headers.get('cache-control'), sniff: response.headers.get('x-content-type-options') }
    }, src)
    expect(served).toEqual({ status: 200, type: 'image/webp', cache: 'private, no-store', sniff: 'nosniff' })

    await page.goto('/products?status=draft')
    // The list shows the upload's small copy.
    await expect(page.getByRole('table', { name: 'Products' }).locator(`img[src="${src}?size=thumb"]`)).toBeVisible()

    const stranger = await browser.newContext({ extraHTTPHeaders: EDGE })
    const theirs = await createSandboxSession('owner')
    const cookieUrl = E2E_BASE_URL.replace('http://', 'https://')
    await stranger.addCookies([
      { name: E2E_SESSION_COOKIE, value: theirs.token, url: cookieUrl, httpOnly: true, secure: true, sameSite: 'Lax' },
      { name: E2E_DEMO_COOKIE, value: '1', url: cookieUrl, httpOnly: true, secure: true, sameSite: 'Lax' },
    ])
    const other = await stranger.newPage()
    await other.goto('/products')
    expect(await other.evaluate(async url => (await fetch(url)).status, src)).toBe(404)
    await stranger.close()
    expect(await page.evaluate(async () => (await fetch('/media/posters')).status)).toBe(404)
  })

  test('replaces and removes an image, queueing the old files for deletion', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    await page.goto('/products/hush')
    await expect(image(page).locator('img')).toHaveAttribute('src', '/posters/hush.webp')
    await image(page).locator('input[type="file"]').setInputFiles(await poster())
    await expect(image(page).locator('img')).toHaveAttribute('src', /^\/media\//)
    const first = (await image(page).locator('img').getAttribute('src'))!.split('/').pop()!
    await image(page).getByRole('button', { name: 'Remove image' }).click()
    const dialog = page.getByRole('dialog', { name: 'Remove the image of Hush?' })
    await dialog.getByRole('button', { name: 'Remove image' }).click()
    await expect(page.getByRole('region', { name: 'Messages' }).getByText('Image removed.')).toBeVisible()
    await expect(image(page).getByText('No image')).toBeVisible()
    const queued = await asSchemaOwner(async c => (await c.query<{ storage_path: string }>(
      'select storage_path from fa.pending_media_deletions where storage_path = $1', [`ws/${workspaceId}/${first}.webp`])).rows)
    expect(queued).toHaveLength(1)
  })

  test('says what is wrong with a file before and after sending it', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/products/loud')
    const picker = image(page).locator('input[type="file"]')
    await picker.setInputFiles({ name: 'big.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(2 * 1024 * 1024 + 10, 1) })
    await expect(image(page).getByRole('alert')).toHaveText('The file is larger than 2 MB.')
    await picker.setInputFiles({ name: 'drawing.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') })
    await expect(image(page).getByRole('alert')).toHaveText('Choose a JPEG, PNG or WebP image.')
    await picker.setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: (await poster()).buffer.subarray(0, 100) })
    await expect(image(page).getByRole('alert')).toHaveText('The image could not be read. It may be damaged.')
    await expect(image(page).locator('img')).toHaveAttribute('src', '/posters/loud.webp')
  })

  test('shows a viewer the image without the controls', async ({ page, context }) => {
    await signInAsSandboxUser(context, 'viewer')
    await page.goto('/products/hush')
    await expect(image(page).locator('img')).toHaveAttribute('src', '/posters/hush.webp')
    await expect(image(page).getByRole('button')).toHaveCount(0)
    await expect(image(page).locator('input[type="file"]')).toHaveCount(0)
  })
})
