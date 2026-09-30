import { expectNoSeriousA11yViolationsInBothThemes } from './a11y'
import { E2E_ORIGIN_SECRET } from './constants'
import { asSchemaOwner } from './db'
import { signInAsSandboxUser } from './sessions'
import { expect, test } from './test'
import { codeFor, readTotpSecret, type Totp } from './totp'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.48' } })

const section = (page: import('@playwright/test').Page, name: string) => page.getByRole('region', { name, exact: true })

test.describe('second factors in a sandbox', () => {
  test('turns the authenticator on, and the user switch then asks for its code', async ({ page, context }) => {
    test.setTimeout(90_000)
    const { workspaceId } = await signInAsSandboxUser(context)
    await page.goto('/settings/security')
    const authenticator = section(page, 'Authenticator app Off')
    await expect(authenticator).toBeVisible()
    await expectNoSeriousA11yViolationsInBothThemes(page)
    const totp: Totp = { secret: await readTotpSecret(page), lastStep: 0 }
    await authenticator.getByLabel('6-digit code').fill('000000')
    await authenticator.getByRole('button', { name: 'Turn on' }).click()
    await expect(authenticator.getByText('The code is not correct. Check it and try again.')).toBeVisible()
    await authenticator.getByLabel('6-digit code').fill(await codeFor(totp))
    await authenticator.getByRole('button', { name: 'Turn on' }).click()
    await expect(page.getByRole('region', { name: 'Notifications' }).getByText('Authenticator app turned on. Your other devices are signed out.')).toBeVisible()
    const codes = page.getByRole('list', { name: 'Save your recovery codes' }).getByRole('listitem')
    await expect(codes).toHaveCount(10)
    await page.getByRole('button', { name: 'I have saved the codes' }).click()
    await expect(codes).toHaveCount(0)
    await expect(section(page, 'Authenticator app On')).toBeVisible()
    await expect(section(page, 'Recovery codes')).toContainText('10 unused codes left of 10.')

    await page.getByRole('region', { name: 'Demo sandbox' }).getByRole('button', { name: 'Switch user' }).click()
    await page.getByRole('dialog', { name: 'Switch user' }).getByRole('radio', { name: /Noah Becker/ }).check()
    await page.getByRole('dialog', { name: 'Switch user' }).getByRole('button', { name: 'Switch', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Account menu: Noah Becker, Admin' })).toBeVisible()
    await page.getByRole('region', { name: 'Demo sandbox' }).getByRole('button', { name: 'Switch user' }).click()
    const dialog = page.getByRole('dialog', { name: 'Switch user' })
    await dialog.getByRole('radio', { name: /Dana Ortiz/ }).check()
    await dialog.getByLabel('Authenticator code').fill(await codeFor(totp))
    await dialog.getByRole('button', { name: 'Switch', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Account menu: Dana Ortiz, Owner' })).toBeVisible()
    const logged = await asSchemaOwner(async c => (await c.query<{ action: string }>(
      "select action from fa.activity_log where workspace_id = $1 and action = 'auth.totp_enabled'", [workspaceId])).rowCount)
    expect(logged).toBe(1)
  })

  test('makes new recovery codes and turns the authenticator off', async ({ page, context }) => {
    test.setTimeout(90_000)
    await signInAsSandboxUser(context)
    await page.goto('/settings/security')
    const totp: Totp = { secret: await readTotpSecret(page), lastStep: 0 }
    await section(page, 'Authenticator app Off').getByLabel('6-digit code').fill(await codeFor(totp))
    await section(page, 'Authenticator app Off').getByRole('button', { name: 'Turn on' }).click()
    await page.getByRole('button', { name: 'I have saved the codes' }).click()
    await section(page, 'Recovery codes').getByRole('button', { name: 'Make new codes…' }).click()
    const confirm = page.getByRole('dialog', { name: 'Make new recovery codes?' })
    await confirm.getByRole('button', { name: 'Make new codes' }).click()
    await expect(page.getByRole('list', { name: 'Save your recovery codes' }).getByRole('listitem')).toHaveCount(10)
    await page.getByRole('button', { name: 'I have saved the codes' }).click()
    await section(page, 'Authenticator app On').getByRole('button', { name: 'Turn off…' }).click()
    await page.getByRole('dialog', { name: 'Turn off the authenticator app?' }).getByRole('button', { name: 'Turn off' }).click()
    await expect(page.getByRole('region', { name: 'Notifications' }).getByText('Authenticator app turned off.')).toBeVisible()
    await expect(section(page, 'Authenticator app Off')).toBeVisible()
    await expect(page.getByRole('list', { name: 'Save your recovery codes' })).toHaveCount(0)
  })
})
