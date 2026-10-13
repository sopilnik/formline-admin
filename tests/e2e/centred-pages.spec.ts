import type { Page } from '@playwright/test'
import { E2E_ORIGIN_SECRET } from './constants.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.58' }, viewport: { width: 1920, height: 1080 } })

/**
 * How far the page's first framed block — the form, list or letter card, which spans the column — sits from the middle
 * of the content area, in whole pixels. The page's own wrapper is no measure: it may span the whole area.
 */
const offCentre = (page: Page) => page.locator('main').evaluate(main => {
  const style = getComputedStyle(main)
  const box = main.getBoundingClientRect()
  const middle = (box.left + parseFloat(style.paddingLeft) + box.right - parseFloat(style.paddingRight)) / 2
  const framed = [...main.querySelectorAll('*')].find(el => parseFloat(getComputedStyle(el).borderTopWidth) > 0 && el.getBoundingClientRect().width > 300)!
  const card = framed.getBoundingClientRect()
  return Math.round((card.left + card.right) / 2 - middle)
})

// On a wide screen a narrow page stands in the middle of the content area, not beside the menu.
test.describe('narrow pages', () => {
  test('stand in the middle of the content area', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    for (const path of ['/products/new', '/collections/new', '/collections', '/notifications', '/settings/profile', '/settings/security', '/settings/store']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      expect(await offCentre(page), path).toBe(0)
    }
  })

  test('a letter in the outbox stands in the middle too', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/team')
    await page.getByLabel('Email').fill('sam.lee@example.test')
    await page.getByRole('button', { name: 'Send invitation' }).click()
    await expect(page.getByRole('region', { name: 'Messages' }).getByText('The invitation to sam.lee@example.test is in the Outbox.')).toBeVisible()
    await page.goto('/outbox')
    await page.getByRole('list', { name: 'Outbox' }).getByRole('link').first().click()
    await expect(page.getByRole('article')).toBeVisible()
    expect(await offCentre(page)).toBe(0)
  })
})
