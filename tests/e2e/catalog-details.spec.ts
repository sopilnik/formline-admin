import sharp from 'sharp'
import type { Page } from '@playwright/test'
import { E2E_ORIGIN_SECRET } from './constants.ts'
import { asSchemaOwner } from './db.ts'
import { openFramed } from './ready.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.68' } })

const poster = () => sharp({ create: { width: 600, height: 800, channels: 3, background: '#a9cdb2' } }).png().toBuffer()
const deleteCard = (page: Page) => page.getByRole('region', { name: 'Delete product' })

test.describe('catalog details', () => {
  test('an image error goes with the removed image, on the product page and the new-product form', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/products/hush')

    const image = page.getByRole('region', { name: 'Image' })

    await image.locator('input[type="file"]').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: (await poster()).subarray(0, 100) })
    await expect(image.getByRole('alert')).toHaveText('The image could not be read. It may be damaged.')
    await image.getByRole('button', { name: 'Remove image' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Remove image' }).click()
    await expect(page.getByRole('region', { name: 'Messages' }).getByText('Image removed.')).toBeVisible()
    await expect(image.getByRole('alert')).toHaveCount(0)

    await openFramed(page, '/products/new')

    const field = page.getByRole('group', { name: 'Image' })

    await field.locator('input[type="file"]').setInputFiles({ name: 'poster.png', mimeType: 'image/png', buffer: await poster() })
    await field.locator('input[type="file"]').setInputFiles({ name: 'big.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(2 * 1024 * 1024 + 10, 1) })
    await expect(field.getByRole('alert')).toHaveText('The file is larger than 2 MB.')
    await field.getByRole('button', { name: 'Remove image' }).click()
    await expect(field.getByRole('alert')).toHaveCount(0)
  })

  test('an archived product says why it cannot be deleted without the advice to archive it', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)

    await asSchemaOwner(c => c.query("update fa.products set status = 'archived' where workspace_id = $1 and slug = 'night-blocks'", [workspaceId]))
    await openFramed(page, '/products/night-blocks')
    await expect(deleteCard(page)).toContainText('This product has orders, so it cannot be deleted. It is archived and out of the catalog.')

    await openFramed(page, '/products/new')
    await page.getByLabel('Name').fill('Quiet Archive')
    await page.getByLabel('Base price, $').fill('30')
    await page.getByLabel('Ink', { exact: true }).check()
    await page.getByRole('button', { name: 'Create product' }).click()
    await expect(page).toHaveURL(/\/products\/quiet-archive$/)
    await asSchemaOwner(c => c.query("update fa.products set status = 'archived' where workspace_id = $1 and slug = 'quiet-archive'", [workspaceId]))
    await openFramed(page, '/products/quiet-archive')
    await expect(deleteCard(page)).toContainText('Only a draft can be deleted. Move the product to drafts first.')
  })

  test('a products link that names a collection no longer there shows every product', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/products?collection=no-such-collection')
    await expect(page).toHaveURL(/\/products$/)
    await expect(page.getByLabel('Collection', { exact: true })).toHaveValue('')
  })

  test('a renamed product moves to its new address when its page was opened with ?lang', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/products/hush?lang=en')

    const details = page.getByRole('region', { name: 'Details' })

    await details.getByLabel('Slug').fill('hush-renamed')
    await details.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('region', { name: 'Messages' }).getByText('Changes saved.')).toBeVisible()
    await expect(page).toHaveURL(/\/products\/hush-renamed$/)
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Hush' })).toBeVisible()
  })
})
