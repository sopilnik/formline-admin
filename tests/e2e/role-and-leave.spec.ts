import { E2E_ORIGIN_SECRET } from './constants.ts'
import { openFramed } from './ready.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.71' } })

test.describe('roles, languages and unsaved forms', () => {
  test('a status change refused for the role says why and draws the page again for that role', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/orders?status=paid')
    await page.getByRole('table', { name: 'Orders' }).getByRole('link', { name: /^#\d+$/ }).first().click()

    await expect(page.getByRole('button', { name: 'Change status' })).toBeVisible()

    // Another tab of the same browser continues as a viewer.
    const other = await context.newPage()

    await openFramed(other, '/overview')
    await other.getByRole('region', { name: 'Demo sandbox' }).getByRole('button', { name: 'Switch user' }).click()
    await other.getByRole('dialog', { name: 'Switch user' }).getByRole('radio', { name: /Tomás Ferreira/ }).check()
    await other.getByRole('dialog', { name: 'Switch user' }).getByRole('button', { name: 'Switch', exact: true }).click()

    await expect(other.getByRole('button', { name: 'Account menu: Tomás Ferreira, Viewer' })).toBeVisible()

    await page.getByRole('button', { name: 'Change status' }).click()
    await page.getByRole('menuitem', { name: 'Processing' }).click()

    await expect(page.getByRole('region', { name: 'Messages' }).getByText('Your role cannot change orders.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Change status' })).toHaveCount(0)
  })

  test('a link with ?lang saves the language to the member\'s profile too', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/overview?lang=ru')
    await openFramed(page, '/settings/profile')

    await expect(page.getByLabel('Язык', { exact: true })).toHaveValue('ru')

    await openFramed(page, '/settings/profile?lang=en')

    await expect(page.getByLabel('Language', { exact: true })).toHaveValue('en')
  })

  test('a form with unsaved changes asks before the tab closes, and an untouched one does not', async ({ context }) => {
    await signInAsSandboxUser(context)

    const typed = await context.newPage()

    await openFramed(typed, '/products/new')
    await typed.getByLabel('Name').fill('Half Typed')

    const asked = new Promise<string>(resolve => typed.once('dialog', dialog => {
      resolve(dialog.type())
      void dialog.dismiss()
    }))

    await typed.close({ runBeforeUnload: true })

    expect(await Promise.race([asked, new Promise<string>(resolve => setTimeout(() => resolve('no dialog'), 5000))])).toBe('beforeunload')
    await expect(typed.getByLabel('Name')).toHaveValue('Half Typed')

    const untouched = await context.newPage()

    await openFramed(untouched, '/products/new')

    let dialogs = 0

    untouched.on('dialog', dialog => {
      dialogs++
      void dialog.dismiss()
    })

    const closed = new Promise<void>(resolve => untouched.once('close', () => resolve()))

    await untouched.close({ runBeforeUnload: true })
    await closed

    expect(dialogs).toBe(0)
  })

  test('a form the server refused still asks before the tab closes', async ({ context }) => {
    await signInAsSandboxUser(context)

    const refused = await context.newPage()

    await openFramed(refused, '/products/new')
    await refused.getByLabel('Name').fill('Half Typed')
    await refused.getByRole('button', { name: 'Create product' }).click()

    await expect(refused.getByLabel('Base price, $')).toHaveAttribute('aria-invalid', 'true')

    const asked = new Promise<string>(resolve => refused.once('dialog', dialog => {
      resolve(dialog.type())
      void dialog.dismiss()
    }))

    await refused.close({ runBeforeUnload: true })

    expect(await Promise.race([asked, new Promise<string>(resolve => setTimeout(() => resolve('no dialog'), 5000))])).toBe('beforeunload')
  })
})
