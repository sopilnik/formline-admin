import { E2E_ORIGIN_SECRET } from './constants.ts'
import { asSchemaOwner } from './db.ts'
import { openFramed } from './ready.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.70' } })

test.describe('copy details', () => {
  test('the avatar takes the first letters of a name that starts with an emoji', async ({ page, context }) => {
    const { workspaceId, userId } = await signInAsSandboxUser(context)

    await asSchemaOwner(c => c.query('update fa.users set name = $3 where workspace_id = $1 and id = $2', [workspaceId, userId, '😀 Émile Zola']))
    await openFramed(page, '/overview')

    const avatar = page.getByRole('button', { name: /^Account menu/ }).locator('[data-initials]')

    await expect(avatar).toHaveAttribute('data-initials', 'ÉZ')
    expect(await avatar.evaluate(el => getComputedStyle(el, '::before').content)).toBe('"ÉZ"')
  })

  test('the store offers UTC first and today\'s zone names', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/settings/store')

    const zones = await page.getByLabel('Time zone').locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value))

    expect(zones[0]).toBe('UTC')
    expect(zones).toEqual(expect.arrayContaining(['Europe/Kyiv', 'Asia/Kolkata', 'Asia/Ho_Chi_Minh']))
    expect(zones).not.toContain('Europe/Kiev')
  })

  test('a zone stored under an old name shows as its current one in the form', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)

    await asSchemaOwner(c => c.query('update fa.store_settings set timezone = $2 where workspace_id = $1', [workspaceId, 'Europe/Kiev']))
    await openFramed(page, '/settings/store')

    await expect(page.getByLabel('Time zone')).toHaveValue('Europe/Kyiv')
  })

  test('the activity log names a changed slug "slug", as its field does', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/products/hush')

    const details = page.getByRole('region', { name: 'Details' })

    await details.getByLabel('Slug').fill('hush-again')
    await details.getByRole('button', { name: 'Save changes' }).click()

    await expect(page).toHaveURL(/\/products\/hush-again$/)

    await openFramed(page, '/activity')

    await expect(page.getByRole('main')).toContainText('Changed: slug')
  })
})
