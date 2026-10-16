import type { Locator } from '@playwright/test'
import { expectNoSeriousA11yViolations } from './a11y.ts'
import { openFramed } from './ready.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

const STOREFRONT = 'Storefront (opens in a new tab)'
const PHONE = { width: 390, height: 844 }

async function expectStoreLink(link: Locator): Promise<void> {
  await expect(link).toHaveAttribute('href', 'https://formline.sopilnik.dev/')
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
}

test.describe('links to the store', () => {
  test('the sidebar links to the store in a new tab', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/overview')

    await expectStoreLink(page.getByRole('complementary').getByRole('link', { name: STOREFRONT }))
  })

  test('the phone drawer links to the store in a new tab', async ({ page, context }) => {
    await page.setViewportSize(PHONE)
    await signInAsSandboxUser(context)
    await openFramed(page, '/overview')
    await page.getByRole('button', { name: 'Open menu' }).click()

    await expectStoreLink(page.getByRole('dialog').getByRole('link', { name: STOREFRONT }))
  })

  test('the sign-in header links to the store in a new tab', async ({ page }) => {
    await page.goto('/sign-in')

    const store = page.getByRole('banner').getByRole('link', { name: /^Formline store/ })

    await expectStoreLink(store)
    await expect(store).toContainText('The shop this panel runs')
    await expectNoSeriousA11yViolations(page)
  })
})
