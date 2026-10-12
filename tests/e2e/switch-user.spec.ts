import { generateHOTP } from '../../src/lib/otp'
import { E2E_ORIGIN_SECRET } from './constants'
import { asSchemaOwner, enrolAuthenticator } from './db'
import { signInAsSandboxUser } from './sessions'
import { expect, test } from './test'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.23' } })

test.describe('switch user', () => {
  test('lists the other demo users and continues as the chosen one', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    await page.goto('/overview')
    await expect(page.getByRole('link', { name: 'Activity' })).toBeVisible()
    await page.getByRole('region', { name: 'Demo sandbox' }).getByRole('button', { name: 'Switch user' }).click()
    const dialog = page.getByRole('dialog', { name: 'Switch user' })
    await expect(dialog.getByRole('radio')).toHaveCount(3)
    for (const name of ['Noah Becker', 'Priya Nair', 'Tomás Ferreira']) await expect(dialog.getByText(name)).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Switch', exact: true })).toBeDisabled()
    await dialog.getByRole('radio', { name: /Tomás Ferreira/ }).check()
    await expect(dialog.getByLabel('Authenticator code')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Switch', exact: true }).click()
    await expect(page).toHaveURL(/\/overview$/)
    await expect(page.getByRole('button', { name: 'Account menu: Tomás Ferreira, Viewer' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Activity' })).toHaveCount(0)
    const log = await asSchemaOwner(async c => (await c.query("select 1 from fa.activity_log where workspace_id = $1 and action = 'sandbox.switched_user'", [workspaceId])).rowCount)
    expect(log).toBe(1)
  })

  test('at 375 px the switch lives in the overflow menu', async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 740 })
    await signInAsSandboxUser(context, 'viewer')
    await page.goto('/overview')
    await page.getByRole('region', { name: 'Demo sandbox' }).getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: 'Switch user' }).click()
    const dialog = page.getByRole('dialog', { name: 'Switch user' })
    await expect(dialog.getByText('Dana Ortiz')).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
  })

  test('keeps the chosen user through a wrong authenticator code', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    const admin = await asSchemaOwner(async c => (await c.query<{ id: string }>("select id from fa.users where workspace_id = $1 and role = 'admin'", [workspaceId])).rows[0]!)
    const secret = new Uint8Array(20).fill(9)
    await enrolAuthenticator(workspaceId, admin.id, secret)
    await page.goto('/overview')
    await page.getByRole('region', { name: 'Demo sandbox' }).getByRole('button', { name: 'Switch user' }).click()
    const dialog = page.getByRole('dialog', { name: 'Switch user' })
    await dialog.getByRole('radio', { name: /Noah Becker/ }).check()
    await dialog.getByLabel('Authenticator code').fill('000000')
    await dialog.getByRole('button', { name: 'Switch', exact: true }).click()
    await expect(dialog.getByText('The code is not correct. Check it and try again.')).toBeVisible()
    // React resets the form after the action; the chosen user must not be lost with it.
    await expect(dialog.getByRole('radio', { name: /Noah Becker/ })).toBeChecked()
    await dialog.getByLabel('Authenticator code').fill(generateHOTP(secret, BigInt(Math.floor(Date.now() / 30_000)), 6))
    await dialog.getByRole('button', { name: 'Switch', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Account menu: Noah Becker, Admin' })).toBeVisible()
  })

  test('hands the visitor’s language to the member they continue as', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/overview?lang=ru')
    await page.getByRole('region', { name: 'Демо-песочница' }).getByRole('button', { name: 'Сменить пользователя' }).click()
    const dialog = page.getByRole('dialog', { name: 'Сменить пользователя' })
    await dialog.getByRole('radio', { name: /Noah Becker/ }).check()
    await dialog.getByRole('button', { name: 'Сменить', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Меню аккаунта: Noah Becker, Администратор' })).toBeVisible()
    await page.goto('/settings/profile')
    await expect(page.getByLabel('Язык', { exact: true })).toHaveValue('ru')
    // An invitation is written in its inviter's language (spec §9).
    await page.goto('/team')
    await page.getByLabel('Email').fill('lena.vogel@example.test')
    await page.getByRole('button', { name: 'Отправить приглашение' }).click()
    await expect(page.getByRole('list', { name: 'Открытые приглашения' }).getByRole('listitem')).toHaveCount(1)
    await page.goto('/outbox')
    const letter = page.getByRole('list', { name: 'Исходящие' }).getByRole('listitem').first().getByRole('link')
    await expect(letter).toHaveText('Noah Becker приглашает вас в Formline Admin')
    await expect(letter).toHaveAttribute('lang', 'ru')
  })
})
