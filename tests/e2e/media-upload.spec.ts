import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { request as playwrightRequest, type Page } from '@playwright/test'
import sharp from 'sharp'
import { roomInWindow } from '../windows'
import { E2E_BASE_URL, E2E_MEDIA_DIR, E2E_ORIGIN_SECRET, E2E_SESSION_COOKIE } from './constants'
import { asSchemaOwner } from './db'
import { signInAsSandboxUser } from './sessions'
import { expect, test } from './test'

const EDGE = { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.36' }
test.use({ extraHTTPHeaders: EDGE })

const png = (width = 360, height = 509) => sharp({ create: { width, height, channels: 3, background: '#57826a' } }).png().toBuffer()

const productId = (workspaceId: string, slug: string) => asSchemaOwner(async c => (await c.query<{ id: string }>(
  'select id from fa.products where workspace_id = $1 and slug = $2', [workspaceId, slug])).rows[0]!.id)

type Answer = { status: number; body: { ok: boolean; error?: string; image?: { id: string; width: number; height: number } }; cache: string | null; retry: string | null }

/** Posts from the page itself, as the product page does: the browser adds the session cookie and `Origin`. */
async function upload(page: Page, url: string, bytes: Buffer): Promise<Answer> {
  return page.evaluate(async ({ url, base64 }) => {
    const body = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
    const response = await fetch(url, { method: 'POST', body, headers: { 'X-Requested-With': 'formline' } })
    return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control'), retry: response.headers.get('retry-after') }
  }, { url, base64: bytes.toString('base64') })
}

test.describe('POST /api/media', () => {
  test('stores a PNG as WebP and makes it the product image', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    const id = await productId(workspaceId, 'hush')
    await page.goto('/products')
    const answer = await upload(page, `/api/media?product=${id}`, await png())
    expect(answer.status).toBe(201)
    expect(answer.cache).toBe('private, no-store')
    expect(answer.body.image).toMatchObject({ width: 360, height: 509 })
    const row = await asSchemaOwner(async c => (await c.query<{ image_id: string; storage_path: string; source: string }>(
      'select p.image_id, i.storage_path, i.source from fa.products p join fa.images i on i.workspace_id = p.workspace_id and i.id = p.image_id where p.workspace_id = $1 and p.id = $2',
      [workspaceId, id])).rows[0]!)
    expect(row).toEqual({ image_id: answer.body.image!.id, storage_path: `ws/${workspaceId}/${answer.body.image!.id}.webp`, source: 'upload' })
    expect(existsSync(join(E2E_MEDIA_DIR, row.storage_path))).toBe(true)
  })

  test('refuses a request that does not prove it comes from the panel', async ({ context }) => {
    const { token, workspaceId } = await signInAsSandboxUser(context)
    const url = `/api/media?product=${await productId(workspaceId, 'hush')}`
    const data = await png()
    const api = await playwrightRequest.newContext({ baseURL: E2E_BASE_URL, extraHTTPHeaders: EDGE })
    const cookie = `${E2E_SESSION_COOKIE}=${token}`
    expect((await api.post(url, { headers: { cookie, origin: E2E_BASE_URL }, data })).status()).toBe(403)
    expect((await api.post(url, { headers: { cookie, origin: 'https://elsewhere.example', 'x-requested-with': 'formline' }, data })).status()).toBe(403)
    expect((await api.post(url, { headers: { origin: E2E_BASE_URL, 'x-requested-with': 'formline' }, data })).status()).toBe(401)
    await api.dispose()
  })

  test('refuses a viewer', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context, 'viewer')
    await page.goto('/products')
    const answer = await upload(page, `/api/media?product=${await productId(workspaceId, 'hush')}`, await png())
    expect([answer.status, answer.body]).toEqual([403, { ok: false, error: 'forbidden' }])
  })

  test('refuses a body that is too large, not an image or broken, and an unknown product', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    await page.goto('/products')
    const url = `/api/media?product=${await productId(workspaceId, 'loud')}`
    const post = async (bytes: Buffer, target = url) => {
      const answer = await upload(page, target, bytes)
      return [answer.status, answer.body.error]
    }
    expect(await post(Buffer.alloc(2 * 1024 * 1024 + 1, 1))).toEqual([413, 'too_large'])
    expect(await post(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'))).toEqual([415, 'type'])
    expect(await post((await png()).subarray(0, 80))).toEqual([422, 'decode'])
    expect(await post(await png(), '/api/media?product=nope')).toEqual([400, 'invalid'])
    expect(await post(await png(), '/api/media?product=00000000-0000-4000-8000-000000000000')).toEqual([404, 'not_found'])
  })

  test('allows twenty uploads an hour per session', async ({ page, context }) => {
    await roomInWindow(60 * 60, 10)
    await signInAsSandboxUser(context)
    await page.goto('/products')
    const answers: Answer[] = []
    for (let i = 0; i < 21; i++) answers.push(await upload(page, '/api/media?product=00000000-0000-4000-8000-000000000000', Buffer.alloc(0)))
    expect(answers.slice(0, 20).map(a => a.status)).toEqual(Array.from({ length: 20 }, () => 400))
    expect(answers[20]!.status).toBe(429)
    expect(Number(answers[20]!.retry)).toBeGreaterThan(0)
  })
})
