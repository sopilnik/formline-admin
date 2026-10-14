import type { Page } from '@playwright/test'
import { E2E_ORIGIN_SECRET } from './constants.ts'
import { enrolAuthenticator } from './db.ts'
import { openFramed } from './ready.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.61' } })

/** The control an action removed or replaced must not leave the keyboard on the page body (WCAG 2.2, 2.4.3). */
const selectAll = (page: Page) => page.getByRole('checkbox', { name: 'Select all orders on this page' }).locator('visible=true')

async function firstPaidOrder(page: Page): Promise<void> {
  await openFramed(page, '/orders?status=paid')
  await page.getByRole('table', { name: 'Orders' }).getByRole('link', { name: /^#\d+$/ }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: /^Order #\d+$/ })).toBeVisible()
}

test.describe('focus after an action', () => {
  test('a final status leaves the focus on the order heading', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await firstPaidOrder(page)
    await page.getByRole('button', { name: 'Change status' }).press('Enter')
    await page.getByRole('menuitem', { name: 'Cancelled' }).press('Enter')
    await expect(page.getByRole('region', { name: 'Messages' }).getByText(/is now Cancelled\.$/)).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: /^Order #\d+$/ })).toBeFocused()
  })

  test('a bulk change and "Clear selection" leave the focus on the select-all box', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/orders?status=paid')
    await page.getByRole('checkbox', { name: /^Select order #\d+$/ }).first().press('Space')
    await page.getByRole('button', { name: 'Change status' }).press('Enter')
    await page.getByRole('menuitem', { name: 'Processing' }).press('Enter')
    await expect(page.getByRole('region', { name: 'Messages' }).getByText('1 order changed to Processing.')).toBeVisible()
    await expect(selectAll(page)).toBeFocused()

    await page.getByRole('checkbox', { name: /^Select order #\d+$/ }).first().press('Space')
    await page.getByRole('button', { name: 'Clear selection' }).press('Enter')
    await expect(selectAll(page)).toBeFocused()
  })

  test('a sort keeps the focus on the column header it was asked from', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/orders')
    await page.getByRole('link', { name: 'Total' }).press('Enter')
    await expect(page).toHaveURL(/sort=total/)
    await expect(page.getByRole('link', { name: 'Total' })).toBeFocused()
  })

  test('removing the image hands the focus to "Upload image"', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/products/hush')
    await page.getByRole('button', { name: 'Remove image' }).press('Enter')
    await page.getByRole('dialog').getByRole('button', { name: 'Remove image' }).press('Enter')
    await expect(page.getByRole('button', { name: 'Upload image' })).toBeFocused()
  })

  test('"Mark all as read" leaves the focus on the page heading', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/notifications')
    await page.getByRole('main').getByRole('button', { name: 'Mark all as read' }).press('Enter')
    await expect(page.getByRole('main').getByRole('button', { name: 'Mark all as read' })).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeFocused()
  })

  test('"Resend" keeps the focus while it works, and "Revoke" moves it to the page heading', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/team')
    await page.getByLabel('Email').fill('focus.check@example.test')
    await page.getByRole('button', { name: 'Send invitation' }).click()
    const resend = page.getByRole('button', { name: 'Resend the invitation to focus.check@example.test' })
    await resend.press('Enter')
    await expect(page.getByRole('region', { name: 'Messages' }).getByText('A new letter to focus.check@example.test is in the Outbox.')).toBeVisible()
    await expect(resend).toBeFocused()
    await page.getByRole('button', { name: 'Revoke the invitation to focus.check@example.test' }).press('Enter')
    await expect(page.getByRole('list', { name: 'Open invitations' })).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1, name: 'Team' })).toBeFocused()
  })

  test('"Clear filters" on the activity log leaves the focus on the page heading', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/activity?when=today')
    await page.getByRole('link', { name: 'Clear filters' }).press('Enter')
    await expect(page).toHaveURL(/\/activity$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Activity' })).toBeFocused()
  })

  test('"Replace the authenticator" opens with the focus in its code field, and "Cancel" brings it back', async ({ page, context }) => {
    const { workspaceId, userId } = await signInAsSandboxUser(context)
    await enrolAuthenticator(workspaceId, userId, new Uint8Array(20).fill(5))
    await openFramed(page, '/settings/security')
    const start = page.getByRole('button', { name: 'Replace the authenticator…' })
    await start.press('Enter')
    await expect(page.getByLabel('6-digit code')).toBeFocused()
    await page.getByRole('button', { name: 'Cancel' }).press('Enter')
    await expect(start).toBeFocused()
  })
})
