import { expectNoSeriousA11yViolations } from './a11y'
import { E2E_AUTH_ENV, E2E_SESSION_COOKIE } from './constants'
import { expect, test } from './test'
import { codeFor, readTotpSecret, type Totp } from './totp'

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
})
