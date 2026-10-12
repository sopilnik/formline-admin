import { expectNoSeriousA11yViolationsInBothThemes } from './a11y.ts'
import { E2E_ORIGIN_SECRET } from './constants.ts'
import { asSchemaOwner } from './db.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.43' } })

/** Three letters as the panel writes them: the newest a Russian sign-in notice. */
async function writeLetters(workspaceId: string): Promise<string> {
  return asSchemaOwner(async c => {
    const insert = (to: string, template: string, payload: object, hoursAgo: number) => c.query<{ id: string }>(
      'insert into fa.outbox_emails (workspace_id, to_address, template, payload, created_at) values ($1, $2, $3, $4, now() - make_interval(hours => $5)) returning id',
      [workspaceId, to, template, JSON.stringify(payload), hoursAgo])
    await insert('noah.becker@formline.example', 'auth.recovery_code_used', { at: new Date(Date.now() - 3 * 3_600_000).toISOString(), remaining: 9, name: 'Noah Becker', locale: 'en' }, 3)
    await insert('dana.ortiz@formline.example', 'auth.second_factor_locked', { at: new Date(Date.now() - 2 * 3_600_000).toISOString(), name: 'Dana Ortiz', locale: 'en' }, 2)
    const newest = await insert('dana.ortiz@formline.example', 'auth.new_sign_in', { at: new Date().toISOString(), device: 'Firefox, Linux', name: 'Dana Ortiz', locale: 'ru' }, 1)
    return newest.rows[0]!.id
  })
}

test.describe('outbox', () => {
  test('lists the letters newest first, each in its own language, and passes axe', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    await writeLetters(workspaceId)
    await page.goto('/outbox')
    await expect(page.getByRole('heading', { level: 1, name: 'Outbox' })).toBeVisible()
    await expect(page).toHaveTitle('Outbox · Formline Admin')
    await expect(page.getByText('3 letters')).toBeVisible()
    const letters = page.getByRole('list', { name: 'Outbox' }).getByRole('listitem')
    await expect(letters).toHaveCount(3)
    await expect(page.getByRole('region', { name: 'Outbox' })).toHaveCount(0)   // the list carries the name, once
    await expect(letters.nth(0).getByRole('link')).toHaveText('Новый вход в ваш аккаунт')
    await expect(letters.nth(0).getByRole('link')).toHaveAttribute('lang', 'ru')
    await expect(letters.nth(1).getByRole('link')).toHaveText('Sign-in locked for an hour')
    await expect(letters.nth(2).getByRole('link')).toHaveText('A recovery code was used')
    await expect(letters.nth(2)).toContainText('To noah.becker@formline.example')
    const toLine = letters.nth(2).getByText(/^To noah\.becker@formline\.example/)
    await expect(toLine).toHaveCSS('word-break', 'normal')
    await expect(toLine).toHaveCSS('overflow-wrap', 'anywhere')
    await expect(page.getByRole('link', { name: 'Outbox', exact: true })).toHaveAttribute('aria-current', 'page')
    await expectNoSeriousA11yViolationsInBothThemes(page)
  })

  test('opens a letter with its sender, its recipient and a working link', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context, 'admin')
    const id = await writeLetters(workspaceId)
    await page.goto('/outbox')
    await page.getByRole('link', { name: 'Новый вход в ваш аккаунт' }).click()
    await expect(page).toHaveURL(new RegExp(`/outbox/${id}$`))
    await expect(page.getByRole('heading', { level: 1, name: 'Новый вход в ваш аккаунт' })).toBeVisible()
    const letter = page.getByRole('article')
    await expect(letter).toContainText('FromFormline <support@formline.example>')
    await expect(letter).toContainText('Todana.ortiz@formline.example')
    await expect(letter).toContainText('Здравствуйте, Dana Ortiz!')
    await expect(letter).toContainText('с устройства Firefox, Linux')
    await expectNoSeriousA11yViolationsInBothThemes(page)
    await letter.getByRole('link', { name: 'Проверить сеансы' }).click()
    await expect(page).toHaveURL(/\/settings\/security$/)
  })

  test('says what will appear in an empty outbox', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/outbox')
    await expect(page.getByRole('heading', { name: 'No letters yet' })).toBeVisible()
    await expect(page.getByText('Invite a team member and the invitation appears here.')).toBeVisible()
  })

  test('is not there for a manager', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context, 'manager')
    const id = await writeLetters(workspaceId)
    await page.goto('/overview')
    await expect(page.getByRole('link', { name: 'Outbox' })).toHaveCount(0)
    // The general page at both addresses: the letter's own view would offer "All letters", which this role may not open.
    for (const path of ['/outbox', `/outbox/${id}`]) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'All letters' })).toHaveCount(0)
      await expect(page.getByRole('main')).toHaveCount(1)
    }
  })
})
