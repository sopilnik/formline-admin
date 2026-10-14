import { E2E_ORIGIN_SECRET } from './constants.ts'
import { hydrated } from './ready.ts'
import { expect, test } from './test.ts'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.72' } })

test('a password field shows what was typed and hides it again, from a button after it', async ({ page }) => {
  await page.goto('/sign-in')
  const password = page.getByLabel('Password', { exact: true })
  const show = page.getByRole('button', { name: 'Show password' })
  await hydrated(show)
  await password.fill('correct horse battery')
  await expect(password).toHaveAttribute('type', 'password')
  await expect(show).toHaveAttribute('aria-pressed', 'false')

  // The button is the next stop after the field, and the keyboard works it.
  await password.press('Tab')
  await expect(show).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(password).toHaveAttribute('type', 'text')
  await expect(password).toHaveValue('correct horse battery')
  await expect(show).toHaveAttribute('aria-pressed', 'true')

  await show.click()
  await expect(password).toHaveAttribute('type', 'password')
  await expect(show).toHaveAttribute('aria-pressed', 'false')
})
