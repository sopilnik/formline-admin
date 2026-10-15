import { expectNoSeriousA11yViolations } from './a11y.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

test('the passkey challenge comes in a signed, strict, five-minute cookie and asks for user verification', async ({ request }) => {
  const res = await request.get('/api/auth/passkey-challenge')

  expect(res.status()).toBe(200)
  expect(res.headers()['cache-control']).toBe('no-store')

  const options = await res.json()

  expect(options).toMatchObject({ rpId: 'localhost', userVerification: 'required' })
  expect(options.challenge).toMatch(/^[A-Za-z0-9_-]{40,}$/)

  const cookie = res.headers()['set-cookie'] ?? ''

  expect(cookie).toMatch(/__Host-formline_passkey=/)
  expect(cookie).toMatch(/HttpOnly/i)
  expect(cookie).toMatch(/Secure/i)
  expect(cookie).toMatch(/SameSite=Strict/i)
  expect(cookie).toMatch(/Max-Age=300/i)
})

test('in a sandbox, passkeys are explained, not offered', async ({ page, context }) => {
  await signInAsSandboxUser(context)
  await page.goto('/settings/security')
  await expect(page.getByRole('heading', { level: 1, name: 'Security' })).toBeVisible()
  await expect(page.getByText(/Passkeys are available in a real account/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add a passkey' })).toHaveCount(0)
  await expectNoSeriousA11yViolations(page)
})
