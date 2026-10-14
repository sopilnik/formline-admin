import { execFileSync } from 'node:child_process'
import type { Page } from '@playwright/test'
import { roomInWindow } from '../windows.ts'
import { expectNoSeriousA11yViolations } from './a11y.ts'
import { E2E_AUTH_ENV, E2E_MIGRATOR_URL, E2E_SESSION_COOKIE } from './constants.ts'
import { ageOwnerAuthentication, expirePendingOwnerSessions } from './db.ts'
import { expect, test } from './test.ts'
import { codeFor, readTotpSecret, type Totp } from './totp.ts'

// One owner per database: these tests run in order and build on each other.
test.describe.configure({ mode: 'serial' })

const owner = { name: 'Alex Owner', email: 'owner@formline.test', password: 'plum-kettle-sunrise-4471' }
const totp: Totp = { secret: new Uint8Array(0), lastStep: 0 }
let recoveryCodes: string[] = []

test('owner setup creates the owner with an authenticator and shows ten recovery codes', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/setup')
  await expect(page.getByRole('heading', { level: 1, name: 'Set up the owner account' })).toBeVisible()
  await expectNoSeriousA11yViolations(page)
  totp.secret = await readTotpSecret(page)
  await expect(page.getByRole('group', { name: 'Authenticator app' })).toHaveCSS('border-top-width', '1px')
  await page.getByLabel('Setup token').fill(E2E_AUTH_ENV.OWNER_SETUP_TOKEN)
  await page.getByLabel('Your name').fill(owner.name)
  await page.getByLabel('Email').fill(owner.email)
  await page.getByLabel('Password', { exact: true }).fill(owner.password)
  await page.getByLabel('6-digit code').fill(await codeFor(totp))
  await page.getByRole('button', { name: 'Create the owner account' }).click()
  await expect(page.getByRole('heading', { name: 'Save your recovery codes' })).toBeVisible()
  recoveryCodes = await page.getByRole('list', { name: 'Save your recovery codes' }).getByRole('listitem').allTextContents()
  expect(recoveryCodes).toHaveLength(10)
  const cookie = (await page.context().cookies()).find(c => c.name === E2E_SESSION_COOKIE)
  expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' })
  await page.getByRole('link', { name: 'Continue to the dashboard' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
})

test('setup is gone once the owner exists', async ({ page }) => {
  expect((await page.goto('/setup'))?.status()).toBe(404)
  await expect(page).toHaveTitle('Page not found · Formline Admin')
  await expect(page.locator('main')).toHaveCount(1)
})

async function signInWithPassword(page: Page, password = owner.password): Promise<void> {
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(owner.email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Account menu/ }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/sign-in$/)
}

test('the owner signs in with the password and an authenticator code, and signs out', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/')
  await expect(page).toHaveURL(/\/sign-in$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
  await expectNoSeriousA11yViolations(page)
  await signInWithPassword(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Two-step verification' })).toBeVisible()
  await expectNoSeriousA11yViolations(page)
  // The intro above names the code, so the field shows its name inside; screen readers still hear it as the label.
  await expect(page.getByLabel('6-digit code')).toHaveAttribute('placeholder', '6-digit code')
  await expect(page.locator('label[for="verify-code"]')).toHaveClass(/\bsr-only\b/)
  await page.getByLabel('6-digit code').fill(await codeFor(totp))
  await page.getByRole('button', { name: 'Verify' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
  await signOut(page)
  await page.goto('/overview')
  await expect(page).toHaveURL(/\/sign-in$/)
})

// The form's own alert is a <p>; Next's hidden route announcer is a <div role="alert">
// mounted in a shadow root on every page, so the role alone is not unique here.
const formAlert = (page: Page) => page.locator('p[role="alert"]')

test('a wrong password and an unknown email get the same message', async ({ page }) => {
  await signInWithPassword(page, 'not-the-password-0000')
  await expect(formAlert(page)).toHaveText('Email or password is incorrect.')
  await page.getByLabel('Email').fill('nobody@formline.test')
  await page.getByLabel('Password').fill(owner.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(formAlert(page)).toHaveText('Email or password is incorrect.')
})

test('an empty sign-in names the field to fill', async ({ page }) => {
  await page.goto('/sign-in')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(formAlert(page)).toHaveText('Enter your email address.')
  await expect(page.getByLabel('Email')).toBeFocused()
  await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true')
  await page.getByLabel('Email').fill(owner.email)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(formAlert(page)).toHaveText('Enter your password.')
  await expect(page.getByLabel('Password')).toBeFocused()
  await expect(page.getByLabel('Password')).toHaveAttribute('aria-invalid', 'true')
})

test('a recovery code replaces the authenticator code', async ({ page }) => {
  await signInWithPassword(page)
  await page.getByRole('button', { name: 'Use a recovery code instead' }).click()
  await page.getByLabel('Recovery code').fill(recoveryCodes[0]!)
  await page.getByRole('button', { name: 'Verify' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
  await signOut(page)
})

test('the owner adds a passkey, signs in with it and removes it', async ({ page }) => {
  test.setTimeout(120_000)
  // The browser's passkey autofill needs a person choosing from its list; this test drives the button.
  await page.addInitScript(() => {
    PublicKeyCredential.isConditionalMediationAvailable = async () => false
  })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  })

  await signInWithPassword(page)
  await page.getByLabel('6-digit code').fill(await codeFor(totp))
  await page.getByRole('button', { name: 'Verify' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()

  await page.goto('/settings/security')
  await expect(page.getByRole('heading', { level: 1, name: 'Security' })).toBeVisible()
  await expectNoSeriousA11yViolations(page)

  await page.getByRole('button', { name: 'Add a passkey' }).click()
  await expect(page.getByText('Passkey added. Your other devices are signed out.')).toBeVisible()
  await expect(page.getByRole('list', { name: 'Passkeys' }).getByRole('listitem')).toHaveCount(1)

  // On a phone the row's buttons sit under the name instead of squeezing it (visual walk, 26 September).
  await page.setViewportSize({ width: 375, height: 812 })
  const name = page.getByRole('list', { name: 'Passkeys' }).getByRole('listitem').getByText('Chrome, Linux')
  const nameBox = (await name.boundingBox())!
  const removeBox = (await page.getByRole('button', { name: /^Remove / }).boundingBox())!
  expect(nameBox.width).toBeGreaterThan(150)
  expect(removeBox.y).toBeGreaterThanOrEqual(nameBox.y + nameBox.height)
  await page.setViewportSize({ width: 1280, height: 720 })

  await signOut(page)
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()

  await page.goto('/settings/security')
  await page.getByRole('button', { name: /^Remove / }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByText('No passkeys yet.')).toBeVisible()
  await signOut(page)
})

test('a sensitive change asks for the password and a code once ten minutes have passed', async ({ page }) => {
  test.setTimeout(120_000)
  await signInWithPassword(page)
  await page.getByLabel('6-digit code').fill(await codeFor(totp))
  await page.getByRole('button', { name: 'Verify' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
  await ageOwnerAuthentication()
  await page.goto('/settings/security')
  await expect(page.getByRole('button', { name: 'Add a passkey' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Add a passkey' })).toHaveAccessibleDescription("Confirm it's you above to add a passkey.")
  // The page asks once, at its top, for every sensitive section; the password section waits for it.
  await expect(page.getByLabel('New password')).toHaveCount(0)
  const reauth = page.getByRole('region', { name: "Confirm it's you" })
  await expect(reauth).toContainText('Changes on this page need a fresh sign-in')
  await reauth.getByRole('button', { name: 'Confirm' }).click()
  await expect(reauth.getByRole('alert')).toHaveText('Enter your password.')
  await reauth.getByLabel('Password').fill('not-the-password-0000')
  await reauth.getByRole('button', { name: 'Confirm' }).click()
  await expect(reauth.getByRole('alert')).toHaveText('The password is not correct.')
  await reauth.getByLabel('Password').fill(owner.password)
  await reauth.getByLabel('6-digit code').fill(await codeFor(totp))
  await reauth.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByRole('heading', { name: "Confirm it's you" })).toBeHidden()
  await expect(page.getByLabel('New password')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add a passkey' })).toBeEnabled()
  await signOut(page)
})

// Keep this the last test before the recovery test: it locks the second factor for an hour.
test('ten wrong codes lock the second factor', async ({ page }) => {
  test.setTimeout(120_000)
  await signInWithPassword(page)
  // The ten wrong codes count in one fixed hour.
  await roomInWindow(60 * 60, 20)
  for (let attempt = 1; attempt <= 10; attempt++) {
    await page.getByLabel('6-digit code').fill('12345')
    const answered = page.waitForResponse(r => r.request().method() === 'POST' && r.request().headers()['next-action'] !== undefined)
    await page.getByRole('button', { name: 'Verify' }).click()
    await answered
  }
  const lockedMessage = 'Too many wrong codes. Two-step verification is locked for an hour, and the owner has been notified.'
  await expect(formAlert(page)).toHaveText(lockedMessage)
  await signInWithPassword(page)
  await page.getByLabel('6-digit code').fill(await codeFor(totp))
  await page.getByRole('button', { name: 'Verify' }).click()
  await expect(formAlert(page)).toHaveText(lockedMessage)
})

test('owner recovery replaces the lost factors and lifts the lock', async ({ page }) => {
  test.setTimeout(120_000)
  const output = execFileSync(process.execPath, ['scripts/owner-recovery.ts'], {
    env: { ...process.env, DATABASE_URL_MIGRATOR: E2E_MIGRATOR_URL },
    encoding: 'utf8',
  })
  const recoveryCode = /Recovery code: ([a-z2-7]{32})/.exec(output)?.[1]
  expect(recoveryCode).toBeDefined()
  await page.goto('/recover')
  await expect(page.getByRole('heading', { level: 1, name: 'Recover the owner account' })).toBeVisible()
  await expectNoSeriousA11yViolations(page)
  totp.secret = await readTotpSecret(page)
  totp.lastStep = 0
  // A recovery code saved at setup belongs on the sign-in page, and the message says so.
  await page.getByLabel('Recovery code from the command').fill(recoveryCodes[1]!)
  await page.getByLabel('New password').fill('new-plum-kettle-sunrise-5582')
  await page.getByLabel('6-digit code').fill('000000')
  await page.getByRole('button', { name: 'Recover the account' }).click()
  await expect(formAlert(page)).toHaveText('This is not a valid code from pnpm owner:recovery, or it has expired. The recovery codes you saved go on the sign-in page.')
  const oldPassword = owner.password
  owner.password = 'new-plum-kettle-sunrise-5582'
  await page.getByLabel('Recovery code from the command').fill(recoveryCode!)
  await page.getByLabel('New password').fill(owner.password)
  await page.getByLabel('6-digit code').fill(await codeFor(totp))
  await page.getByRole('button', { name: 'Recover the account' }).click()
  await expect(page.getByRole('heading', { name: 'Save your recovery codes' })).toBeVisible()
  await page.getByRole('link', { name: 'Continue to the dashboard' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
  await signOut(page)
  await signInWithPassword(page, oldPassword)
  await expect(formAlert(page)).toHaveText('Email or password is incorrect.')
  await signInWithPassword(page)
  await page.getByLabel('6-digit code').fill(await codeFor(totp))
  await page.getByRole('button', { name: 'Verify' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
})

test('the owner changes the password, and the new one signs in', async ({ page }) => {
  test.setTimeout(120_000)
  await signInWithPassword(page)
  await page.getByLabel('6-digit code').fill(await codeFor(totp))
  await page.getByRole('button', { name: 'Verify' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
  await page.goto('/settings/security')
  const next = 'quiet-harbour-lantern-9083'
  await page.getByLabel('New password').fill('too-short')
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByText('Use at least 12 characters.')).toBeVisible()
  await page.getByLabel('New password').fill(next)
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByRole('region', { name: 'Messages' }).getByText('Password changed. Your other devices are signed out.')).toBeVisible()
  const oldPassword = owner.password
  owner.password = next
  await signOut(page)
  await signInWithPassword(page, oldPassword)
  await expect(formAlert(page)).toHaveText('Email or password is incorrect.')
  await signInWithPassword(page)
  await page.getByLabel('6-digit code').fill(await codeFor(totp))
  await page.getByRole('button', { name: 'Verify' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
})

test('the verify page starts a new kind of code clean, and a sign-in that took too long says so', async ({ page }) => {
  await signInWithPassword(page)
  await page.getByLabel('6-digit code').fill('000000')
  await page.getByRole('button', { name: 'Verify' }).click()
  await expect(formAlert(page)).toHaveText('The code is not correct. Check it and try again.')
  await page.getByRole('button', { name: 'Use a recovery code instead' }).click()
  await expect(formAlert(page)).toHaveCount(0)
  await expect(page.getByLabel('Recovery code')).not.toHaveAttribute('aria-invalid')
  await page.getByRole('button', { name: 'Use the authenticator app instead' }).click()
  await expect(formAlert(page)).toHaveCount(0)
  await expect(page.getByLabel('6-digit code')).not.toHaveAttribute('aria-invalid')

  await expirePendingOwnerSessions()
  await page.getByLabel('6-digit code').fill(await codeFor(totp))
  await page.getByRole('button', { name: 'Verify' }).click()
  await expect(page).toHaveURL(/\/sign-in\?expired=1$/)
  await expect(formAlert(page)).toHaveText('The sign-in took too long. Start again.')
})
