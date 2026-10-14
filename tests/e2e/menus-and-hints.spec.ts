import { E2E_ORIGIN_SECRET } from './constants.ts'
import { openFramed } from './ready.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.69' } })

const REVENUE_HINT = 'The sum of the totals of the paid, processing, shipped and delivered orders placed in the period.'

test.describe('menus, the palette and hints', () => {
  test('a theme or a language choice closes its menu, so the next click goes where it points', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/overview')
    await page.getByRole('banner').getByRole('button', { name: /^Theme/ }).click()
    await page.getByRole('menuitemradio', { name: 'Dark' }).click()
    await expect(page.getByRole('menu')).toHaveCount(0)
    await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: /^Orders/ }).click()
    await expect(page).toHaveURL(/\/orders$/)

    await page.getByRole('banner').getByRole('button', { name: /^Language/ }).click()
    await page.getByRole('menuitemradio', { name: 'Русский' }).click()
    await expect(page.getByRole('menu')).toHaveCount(0)
  })

  test('Ctrl K over an open dialog leaves the dialog alone', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/overview')
    await page.getByRole('region', { name: 'Demo sandbox' }).getByRole('button', { name: 'Switch user' }).click()
    const dialog = page.getByRole('dialog', { name: 'Switch user' })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('dialog', { name: 'Search and commands' })).toHaveCount(0)
    await expect(dialog).toBeVisible()
  })

  test('the palette\'s form actions put the focus in the form\'s first field', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/overview')
    const input = page.getByRole('combobox', { name: 'Search pages, actions, orders, customers and products' })
    await page.keyboard.press('Control+k')
    await input.fill('invite')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/team#team-invite$/)
    await expect(page.locator('#invite-email')).toBeFocused()

    await page.keyboard.press('Control+k')
    await input.fill('new product')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/products\/new$/)
    await expect(page.locator('#product-name')).toBeFocused()
  })
})

test.describe('a metric\'s explanation on a touch screen', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('opens with a tap and closes with the next', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/overview')
    // What a person sees: an explanation drawn in full, not one faded out after the touch passed over the button.
    const shown = () => page.locator('[data-slot="tooltip-content"]').evaluateAll(tips => tips
      .filter(tip => tip.getBoundingClientRect().width > 0 && getComputedStyle(tip).opacity === '1')
      .map(tip => tip.textContent?.trim()))
    const about = page.getByRole('button', { name: 'About revenue' })
    await about.tap()
    await expect.poll(shown, { timeout: 3000 }).toEqual([REVENUE_HINT])
    await page.waitForTimeout(1500)
    expect(await shown()).toEqual([REVENUE_HINT])
    await about.tap()
    await expect.poll(shown, { timeout: 3000 }).toEqual([])
  })
})
