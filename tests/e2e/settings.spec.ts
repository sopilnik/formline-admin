import { expectNoSeriousA11yViolationsInBothThemes } from './a11y.ts'
import { E2E_ORIGIN_SECRET } from './constants.ts'
import { asSchemaOwner } from './db.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.46' } })

test.describe('settings', () => {
  test('opens on the profile, with a tab per section, and passes axe', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/overview')
    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await expect(page).toHaveURL(/\/settings\/profile$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible()
    await expect(page).toHaveTitle('Profile · Formline Admin')
    const tabs = page.getByRole('navigation', { name: 'Settings sections' })
    await expect(tabs.getByRole('link')).toHaveText(['Profile', 'Security', 'Store'])
    await expect(tabs.getByRole('link', { name: 'Profile' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByText('Signed in as dana.ortiz@formline.example. The email cannot be changed.')).toBeVisible()
    // Only the address may break inside the sentence, never an ordinary word.
    const account = page.getByText('Signed in as dana.ortiz@formline.example. The email cannot be changed.')
    await expect(account).toHaveCSS('word-break', 'normal')
    await expect(account).toHaveCSS('overflow-wrap', 'anywhere')
    await expectNoSeriousA11yViolationsInBothThemes(page)
  })

  test('saves the name, and a new language turns the panel Russian', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/settings/profile')
    await page.getByLabel('Name').fill('Dana Ortiz-Weber')
    await page.getByRole('button', { name: 'Save profile' }).click()
    await expect(page.getByRole('region', { name: 'Messages' }).getByText('Profile saved.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Account menu: Dana Ortiz-Weber, Owner' })).toBeVisible()
    await page.getByLabel('Language', { exact: true }).selectOption('ru')
    await page.getByRole('button', { name: 'Save profile' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Профиль' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
    await page.getByLabel('Имя').fill('')
    await page.getByRole('button', { name: 'Сохранить профиль' }).click()
    await expect(page.getByText('Введите имя.')).toBeVisible()
    await expect(page.getByLabel('Имя')).toBeFocused()
  })

  test('changes the store settings, keeps them and refuses a negative threshold', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context, 'admin')
    await page.goto('/settings/store')
    await expect(page.getByRole('heading', { level: 1, name: 'Store' })).toBeVisible()
    await expect(page.getByLabel('Time zone')).toHaveValue('Europe/Berlin')
    await page.getByLabel('Time zone').selectOption('Asia/Almaty')
    await page.getByLabel('Low-stock threshold').fill('-1')
    await page.getByRole('button', { name: 'Save settings' }).click()
    await expect(page.getByText('Enter a whole number from 0 to 999.')).toBeVisible()
    await expect(page.getByLabel('Low-stock threshold')).toBeFocused()
    await expect(page.getByLabel('Time zone')).toHaveValue('Asia/Almaty')
    await page.getByLabel('Low-stock threshold').fill('5')
    await page.getByRole('button', { name: 'Save settings' }).click()
    await expect(page.getByRole('region', { name: 'Messages' }).getByText('Store settings saved.')).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('Time zone')).toHaveValue('Asia/Almaty')
    await expect(page.getByLabel('Low-stock threshold')).toHaveValue('5')
    const logged = await asSchemaOwner(async c => (await c.query<{ details: { changed: string[] } }>(
      "select details from fa.activity_log where workspace_id = $1 and action = 'settings.store_updated'", [workspaceId])).rows)
    expect(logged).toEqual([{ details: { changed: ['timezone', 'lowStockDefault'] } }])
    await expectNoSeriousA11yViolationsInBothThemes(page)
  })

  test('keeps the store settings from a manager', async ({ page, context }) => {
    await signInAsSandboxUser(context, 'manager')
    await page.goto('/settings/profile')
    await expect(page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link')).toHaveText(['Profile', 'Security'])
    await page.goto('/settings/store')
    await expect(page.getByRole('heading', { level: 1, name: /not found/ })).toBeVisible()
  })
})
