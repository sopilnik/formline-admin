import { roomInWindow } from '../windows.ts'
import { expectNoSeriousA11yViolations } from './a11y.ts'
import { E2E_DEMO_COOKIE, E2E_ORIGIN_SECRET, E2E_SESSION_COOKIE } from './constants.ts'
import { expect, test } from './test.ts'

// This file presses "Enter the demo" six times; its own address keeps that away from the other files.
test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.21' } })

test.describe('Enter the demo', () => {
  // The six entries of this file count in one fixed hour of create_sandbox.
  test.beforeAll(() => roomInWindow(60 * 60, 20))

  test('opens a fresh sandbox on the overview as the demo owner', async ({ page, context }) => {
    await page.goto('/sign-in')

    await expect(page.getByRole('heading', { level: 2, name: 'Try the demo' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Owner sign-in' })).toBeVisible()
    await expectNoSeriousA11yViolations(page)

    await page.getByRole('button', { name: 'Enter the demo' }).click()

    await expect(page).toHaveURL(/\/overview$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Account menu: Dana Ortiz, Owner' })).toBeVisible()

    const cookies = await context.cookies()

    expect(cookies.find(c => c.name === E2E_SESSION_COOKIE)).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax' })
    expect(cookies.find(c => c.name === E2E_DEMO_COOKIE)).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax' })

    // A returning visitor with a live cookie continues in the same sandbox.
    await page.goto('/sign-in')

    await expect(page).toHaveURL(/\/overview$/)
  })

  test('refuses the sixth sandbox from one address within an hour and says how long to wait', async ({ page, context }) => {
    for (let i = 0; i < 4; i++) {
      await context.clearCookies()
      await page.goto('/sign-in')
      await page.getByRole('button', { name: 'Enter the demo' }).click()

      await expect(page).toHaveURL(/\/overview$/)
    }

    await context.clearCookies()
    await page.goto('/sign-in')
    await page.getByRole('button', { name: 'Enter the demo' }).click()

    // Next's route announcer also carries role="alert"; this is the form's own alert.
    await expect(page.locator('p[role="alert"]')).toHaveText(/^Too many demo sandboxes from your network\. Try again in \d+ minutes?\.$/)
    await expect(page).toHaveURL(/\/sign-in$/)
    expect((await context.cookies()).find(c => c.name === E2E_SESSION_COOKIE)).toBeUndefined()
  })
})
