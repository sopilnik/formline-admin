import { rmSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import sharp from 'sharp'
import { E2E_MEDIA_DIR, E2E_ORIGIN_SECRET } from './constants.ts'
import { asSchemaOwner } from './db.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.60' } })

const productId = (workspaceId: string, slug: string) => asSchemaOwner(async c => (await c.query<{ id: string }>(
  'select id from fa.products where workspace_id = $1 and slug = $2', [workspaceId, slug])).rows[0]!.id)

/** Uploads from the page itself, as the product page does; answers the new image's id. */
async function upload(page: Page, productId: string): Promise<string> {
  const png = await sharp({ create: { width: 360, height: 509, channels: 3, background: '#57826a' } }).png().toBuffer()
  const answer = await page.evaluate(async ({ url, base64 }) => {
    const body = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
    const response = await fetch(url, { method: 'POST', body, headers: { 'X-Requested-With': 'formline' } })
    return response.json() as Promise<{ image: { id: string } }>
  }, { url: `/api/media?product=${productId}`, base64: png.toString('base64') })
  return answer.image.id
}

/** The pixel size of the image at an address, read from the bytes the page receives. */
async function sizeAt(page: Page, url: string): Promise<[number, number]> {
  const base64 = await page.evaluate(async address => {
    const bytes = new Uint8Array(await (await fetch(address)).arrayBuffer())
    return btoa(String.fromCharCode(...bytes))
  }, url)
  const meta = await sharp(Buffer.from(base64, 'base64')).metadata()
  return [meta.width!, meta.height!]
}

test.describe('thumbnails', () => {
  test('the products list shows the small copies of the posters', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/products')
    // The list streams in behind the loading skeleton and is revealed a frame after the load event.
    await expect(page.locator('main img').first()).toBeVisible()
    const sources = await page.locator('main img').evaluateAll(list => list.map(img => img.getAttribute('src') ?? ''))
    expect(sources.length).toBeGreaterThan(0)
    expect(sources.filter(src => !src.startsWith('/posters/thumb/'))).toEqual([])
    expect(await sizeAt(page, sources[0]!)).toEqual([120, 170])
  })

  test('an upload gets its small copy, and one stored without a copy is served whole', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    await page.goto('/products')
    const id = await upload(page, await productId(workspaceId, 'hush'))
    expect(await sizeAt(page, `/media/${id}?size=thumb`)).toEqual([120, 170])
    expect(await sizeAt(page, `/media/${id}`)).toEqual([360, 509])

    await page.goto('/products')
    await expect(page.locator(`main img[src="/media/${id}?size=thumb"]`).first()).toBeVisible()

    // An image uploaded before the copies existed has none: the full file stands in.
    rmSync(join(E2E_MEDIA_DIR, `ws/${workspaceId}/${id}.thumb.webp`))
    expect(await sizeAt(page, `/media/${id}?size=thumb`)).toEqual([360, 509])
  })
})
