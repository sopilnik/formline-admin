import { createHash, randomBytes } from 'node:crypto'
import { expectNoSeriousA11yViolationsInBothThemes } from './a11y'
import { E2E_ORIGIN_SECRET } from './constants'
import { asSchemaOwner } from './db'
import { signInAsSandboxUser } from './sessions'
import { expect, test } from './test'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.47' } })

/** Another signed-in device of the same member, as a second browser would leave it. */
const otherDevice = (workspaceId: string, userId: string, agent: string) => asSchemaOwner(c => c.query(
  "insert into fa.sessions (workspace_id, id, user_id, expires_at, second_factor_verified, user_agent_summary) values ($1, $2, $3, now() + interval '1 hour', true, $4)",
  [workspaceId, createHash('sha256').update(randomBytes(20)).digest('hex'), userId, agent]))

test.describe('security settings in a sandbox', () => {
  test('explains the password, lists the devices and passes axe', async ({ page, context }) => {
    const { workspaceId, userId } = await signInAsSandboxUser(context)
    await otherDevice(workspaceId, userId, 'Safari, iOS')
    await page.goto('/settings/security')
    await expect(page.getByText(/Demo members enter through the demo and have no password/)).toBeVisible()
    await expect(page.getByLabel('New password')).toHaveCount(0)
    const devices = page.getByRole('list', { name: 'Signed-in devices' }).getByRole('listitem')
    await expect(devices).toHaveCount(2)
    await expect(devices.filter({ hasText: 'This device' })).toHaveCount(1)
    await expect(devices.filter({ hasText: 'This device' }).getByRole('button')).toHaveCount(0)
    await expectNoSeriousA11yViolationsInBothThemes(page)
  })

  test('signs out one other device, then all the others, and logs both', async ({ page, context }) => {
    const { workspaceId, userId } = await signInAsSandboxUser(context)
    await otherDevice(workspaceId, userId, 'Safari, iOS')
    await otherDevice(workspaceId, userId, 'Firefox, Windows')
    await page.goto('/settings/security')
    const devices = page.getByRole('list', { name: 'Signed-in devices' }).getByRole('listitem')
    await expect(devices).toHaveCount(3)
    await page.getByRole('button', { name: 'Sign out Safari, iOS' }).click()
    await expect(page.getByRole('region', { name: 'Messages' }).getByText('The device is signed out.')).toBeVisible()
    await expect(devices).toHaveCount(2)
    await page.getByRole('button', { name: 'Sign out of all other devices' }).click()
    await expect(page.getByRole('region', { name: 'Messages' }).getByText('1 other device is signed out.')).toBeVisible()
    await expect(devices).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Sign out of all other devices' })).toHaveCount(0)
    const logged = await asSchemaOwner(async c => (await c.query<{ action: string }>(
      "select action from fa.activity_log where workspace_id = $1 and action like 'auth.%session%' order by at", [workspaceId])).rows.map(r => r.action))
    expect(logged).toEqual(['auth.session_revoked', 'auth.other_sessions_revoked'])
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Security' })).toBeVisible()
  })
})
