import type { Page } from '@playwright/test'
import { expectNoSeriousA11yViolationsInBothThemes } from './a11y.ts'
import { E2E_ORIGIN_SECRET } from './constants.ts'
import { navigationsTo } from './navigations.ts'
import { openFramed } from './ready.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.52' } })

const help = (page: Page) => page.getByRole('dialog', { name: 'Keyboard shortcuts' })
const palette = (page: Page) => page.getByRole('dialog', { name: 'Search and commands' })

/** Clicks the page's heading, so the keys land on the page and not in a field. */
async function focusPage(page: Page): Promise<void> {
  await page.getByRole('heading', { level: 1 }).click()
}

async function turnShortcutsOff(page: Page): Promise<void> {
  await page.goto('/settings/profile')

  const box = page.getByRole('checkbox', { name: 'Single-key shortcuts' })

  await expect(box).toBeChecked()

  await box.uncheck()
  await page.getByRole('button', { name: 'Save profile' }).click()

  await expect(page.getByRole('region', { name: 'Messages' }).getByText('Profile saved.')).toBeVisible()
  await expect(box).not.toBeChecked()
}

test.describe('keyboard shortcuts', () => {
  test('move between pages, find the page\'s search and list themselves, but never while one types', async ({ page, context }) => {
    await signInAsSandboxUser(context, 'viewer')
    await openFramed(page, '/overview')

    await focusPage(page)
    await page.keyboard.press('g')
    await page.keyboard.press('o')

    await expect(page).toHaveURL(/\/orders$/)

    await focusPage(page)
    await page.keyboard.press('/')

    const search = page.getByRole('searchbox')

    await expect(search).toBeFocused()

    await page.keyboard.type('go')

    await expect(search).toHaveValue('go')
    await expect(page).toHaveURL(/\/orders(\?|$)/)

    await focusPage(page)
    await page.keyboard.press('g')
    await page.keyboard.press('c')

    await expect(page).toHaveURL(/\/customers$/)

    await focusPage(page)
    await page.keyboard.press('Shift+?')

    await expect(help(page)).toBeVisible()
    await expect(help(page).getByRole('button', { name: 'Dismiss' })).toBeVisible()   // the close button speaks the interface's language
    await expect(help(page).getByRole('term')).toHaveText([
      'Open the search and commands', 'Search on this page', 'Go to Overview', 'Go to Orders', 'Go to Products', 'Go to Customers', 'Show this list',
    ])
    await expectNoSeriousA11yViolationsInBothThemes(page, '[role="dialog"]')

    // The list has the keys to itself. The products page was not visited yet, so a go would have asked the server for it
    // before the list closes on Escape.
    const toProducts = navigationsTo(page, '/products')

    await page.keyboard.press('g')
    await page.keyboard.press('p')
    await page.keyboard.press('Escape')

    await expect(help(page)).toBeHidden()
    expect(toProducts).toEqual([])
    await expect(page).toHaveURL(/\/customers$/)
  })

  test('the profile turns the single keys off; Ctrl+K and the list in the palette stay', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await turnShortcutsOff(page)
    await openFramed(page, '/overview')
    await focusPage(page)

    const toOrders = navigationsTo(page, '/orders')

    await page.keyboard.press('g')
    await page.keyboard.press('o')
    await page.keyboard.press('Shift+?')
    // Ctrl+K stays on: once its palette shows, the keys before it have been handled.
    await page.keyboard.press('Control+k')

    await expect(palette(page)).toBeVisible()
    await expect(help(page)).toBeHidden()
    expect(toOrders).toEqual([])
    await expect(page).toHaveURL(/\/overview$/)

    await palette(page).getByRole('option', { name: 'Keyboard shortcuts' }).click()

    await expect(help(page)).toContainText('Single-key shortcuts are off.')

    await help(page).getByRole('link', { name: 'Turn them on in your profile' }).click()

    await expect(page).toHaveURL(/\/settings\/profile$/)
  })

  test('a switch to another demo user keeps them off', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await turnShortcutsOff(page)
    await page.getByRole('region', { name: 'Demo sandbox' }).getByRole('button', { name: 'Switch user' }).click()

    const dialog = page.getByRole('dialog', { name: 'Switch user' })

    await dialog.getByRole('radio', { name: /Priya Nair/ }).check()
    await dialog.getByRole('button', { name: 'Switch', exact: true }).click()

    await expect(page.getByRole('button', { name: 'Account menu: Priya Nair, Manager' })).toBeVisible()

    await focusPage(page)

    const toOrders = navigationsTo(page, '/orders')

    await page.keyboard.press('g')
    await page.keyboard.press('o')
    await page.keyboard.press('Control+k')

    await expect(palette(page)).toBeVisible()
    expect(toOrders).toEqual([])
    await expect(page).toHaveURL(/\/overview$/)

    await page.keyboard.press('Escape')
    await page.goto('/settings/profile')

    await expect(page.getByRole('checkbox', { name: 'Single-key shortcuts' })).not.toBeChecked()
  })
})
