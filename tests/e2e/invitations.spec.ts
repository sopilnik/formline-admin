import { expectNoSeriousA11yViolationsInBothThemes } from './a11y.ts'
import { E2E_ORIGIN_SECRET } from './constants.ts'
import { asSchemaOwner } from './db.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.45' } })

const tokenOfLetter = (workspaceId: string, email: string) => asSchemaOwner(async c => (await c.query<{ token: string }>(
  "select payload->>'token' as token from fa.outbox_emails where workspace_id = $1 and to_address = $2 order by created_at desc limit 1", [workspaceId, email])).rows[0]!.token)

test.describe('invitations', () => {
  test('invites a member, accepts the letter from the outbox and continues as them', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/team')
    await page.getByLabel('Email').fill('alex.kim@example.test')
    await page.getByLabel('Role').selectOption('manager')
    await page.getByRole('button', { name: 'Send invitation' }).click()
    await expect(page.getByRole('region', { name: 'Messages' }).getByText('The invitation to alex.kim@example.test is in the Outbox.')).toBeVisible()
    const open = page.getByRole('list', { name: 'Open invitations' })
    await expect(open.getByRole('listitem')).toHaveCount(1)
    await expect(open).toContainText('Manager · sent')
    await expect(page.getByLabel('Email')).toHaveValue('')

    await page.goto('/outbox')
    await page.getByRole('link', { name: 'Dana Ortiz invited you to Formline Admin' }).click()
    await expect(page.getByRole('article')).toContainText('as a manager')
    await page.getByRole('link', { name: 'Accept the invitation' }).click()
    await expect(page).toHaveURL(/\/invite\/[a-z2-7]{32}$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Invitation to the team' })).toBeVisible()
    await expect(page.getByText('Dana Ortiz invited alex.kim@example.test to join the Formline team. Role: Manager.')).toBeVisible()
    await expectNoSeriousA11yViolationsInBothThemes(page)
    const link = page.url()
    await page.getByLabel('Your name').fill('Alex Kim')
    await page.getByRole('button', { name: 'Accept and continue' }).click()
    await expect(page).toHaveURL(/\/overview$/)
    await expect(page.getByRole('button', { name: 'Account menu: Alex Kim, Manager' })).toBeVisible()
    await page.goto(link)
    await expect(page.getByRole('heading', { name: 'This invitation cannot be used' })).toBeVisible()
    await expect(page.getByText('It has already been accepted.')).toBeVisible()
  })

  test('says why an invitation is refused', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/team')
    await page.getByLabel('Email').fill('noah.becker@formline.example')
    await page.getByRole('button', { name: 'Send invitation' }).click()
    await expect(page.getByText('A member of this team already has this email.')).toBeVisible()
    await expect(page.getByLabel('Email')).toBeFocused()
    await page.getByLabel('Email').fill('not an email')
    await page.getByRole('button', { name: 'Send invitation' }).click()
    await expect(page.getByText('Enter an email address such as alex@example.com.')).toBeVisible()
    await expect(page.getByLabel('Email')).toHaveValue('not an email')
  })

  test('resends and revokes an open invitation', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context, 'admin')
    await page.goto('/team')
    await page.getByLabel('Email').fill('sam.lee@example.test')
    await page.getByRole('button', { name: 'Send invitation' }).click()
    await page.getByRole('button', { name: 'Resend the invitation to sam.lee@example.test' }).click()
    await expect(page.getByRole('region', { name: 'Messages' }).getByText('A new letter to sam.lee@example.test is in the Outbox.')).toBeVisible()
    const letters = await asSchemaOwner(async c => (await c.query<{ n: number }>(
      "select count(*)::int as n from fa.outbox_emails where workspace_id = $1 and to_address = 'sam.lee@example.test'", [workspaceId])).rows[0]!.n)
    expect(letters).toBe(2)
    const token = await tokenOfLetter(workspaceId, 'sam.lee@example.test')
    await page.getByRole('button', { name: 'Revoke the invitation to sam.lee@example.test' }).click()
    await expect(page.getByRole('region', { name: 'Messages' }).getByText('The invitation to sam.lee@example.test is revoked.')).toBeVisible()
    await expect(page.getByRole('list', { name: 'Open invitations' })).toHaveCount(0)
    await page.goto(`/invite/${token}`)
    await expect(page.getByText('It was revoked.')).toBeVisible()
  })

  test('does not open another sandbox’s invitation', async ({ page, context, browser }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    await page.goto('/team')
    await page.getByLabel('Email').fill('kept.private@example.test')
    await page.getByRole('button', { name: 'Send invitation' }).click()
    await expect(page.getByRole('list', { name: 'Open invitations' }).getByRole('listitem')).toHaveCount(1)
    const token = await tokenOfLetter(workspaceId, 'kept.private@example.test')
    const stranger = await browser.newContext({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.45' } })
    await signInAsSandboxUser(stranger)
    const other = await stranger.newPage()
    await other.goto(`/invite/${token}`)
    await expect(other.getByText('This sandbox has no invitation at this address.')).toBeVisible()
    await expect(other.getByRole('button', { name: 'Accept and continue' })).toHaveCount(0)
    await stranger.close()
  })

  test('wraps a long address inside the toast on a phone', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('/team')
    const email = 'alexandra.konstantinopolskaya@example.test'
    await page.getByLabel('Email').fill(email)
    await page.getByRole('button', { name: 'Send invitation' }).click()
    const toast = page.getByRole('region', { name: 'Messages' }).getByText(`The invitation to ${email} is in the Outbox.`)
    await expect(toast).toBeVisible()
    expect(await toast.evaluate(title => title.scrollWidth <= title.clientWidth)).toBe(true)
  })
})
