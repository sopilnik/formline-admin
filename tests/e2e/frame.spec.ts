import type { Page } from '@playwright/test'
import { expectNoSeriousA11yViolations } from './a11y'
import { signInAsSandboxUser } from './sessions'
import { expect, test } from './test'

const sidebarBackground = (page: Page) => page.locator('aside').evaluate(el => getComputedStyle(el).backgroundColor)

test.describe('app frame', () => {
  test('has a skip link, landmarks and the sidebar on dark tokens in the light theme', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/overview')
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
    await expect(page).toHaveTitle('Overview · Formline Admin')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
    await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeVisible()
    await expect(page.getByRole('banner')).toBeVisible()
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
    expect(await sidebarBackground(page)).toBe('rgb(23, 24, 26)')
    await expectNoSeriousA11yViolations(page)
  })

  test('keyboard focus shows the solid outline in the colour of its surface', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/overview')
    const orders = page.getByRole('link', { name: /^Orders/ })
    await orders.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(orders).toBeFocused()
    const outline = await orders.evaluate(el => {
      const s = getComputedStyle(el)
      return [s.outlineStyle, s.outlineWidth, s.outlineColor]
    })
    expect(outline).toEqual(['solid', '2px', 'rgb(240, 122, 79)'])
  })

  test('the theme menu switches and remembers the theme', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/overview')
    await page.getByRole('button', { name: 'Theme: System' }).click()
    await page.getByRole('menuitemradio', { name: 'Dark' }).click()
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    await page.reload()
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    expect(await sidebarBackground(page)).toBe('rgb(26, 27, 29)')
    await expectNoSeriousA11yViolations(page)
    await page.getByRole('button', { name: 'Theme: Dark' }).click()
    await page.getByRole('menuitemradio', { name: 'System' }).click()
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
  })

  test('the language menu switches to Russian', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/overview')
    await page.getByRole('button', { name: 'Language: English' }).click()
    await page.getByRole('menuitemradio', { name: 'Русский' }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
    await expect(page.getByRole('heading', { level: 1, name: 'Обзор' })).toBeVisible()
    await expect(page.getByRole('link', { name: /^Заказы/ })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Уведомления' })).toBeAttached()
  })

  test('a viewer does not see the activity log or the outbox', async ({ page, context }) => {
    await signInAsSandboxUser(context, 'viewer')
    await page.goto('/overview')
    await expect(page.getByRole('link', { name: 'Team' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Activity' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Outbox' })).toHaveCount(0)
  })

  test('the menu collapses to icons and stays collapsed', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/overview')
    await page.getByRole('button', { name: 'Collapse menu' }).click()
    await expect(page.getByRole('button', { name: 'Expand menu' })).toBeVisible()
    await expect(page.getByRole('link', { name: /^Orders/ })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Expand menu' })).toBeVisible()
  })

  test('on a phone the menu is a drawer', async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await signInAsSandboxUser(context)
    await page.goto('/overview')
    await expect(page.locator('aside')).toBeHidden()
    await page.getByRole('button', { name: 'Open menu' }).click()
    const drawer = page.getByRole('dialog', { name: 'Main menu' })
    await expect(drawer.getByRole('link', { name: /^Orders/ })).toBeVisible()
    await expectNoSeriousA11yViolations(page)
    await drawer.getByRole('button', { name: 'Close menu' }).click()
    await expect(drawer).toBeHidden()
  })

  test('signing out ends the session', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/overview')
    await page.getByRole('button', { name: /^Account menu/ }).click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await page.getByRole('dialog', { name: 'Sign out and end the demo?' }).getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/sign-in$/)
    expect((await context.cookies()).some(c => c.name === '__Host-formline_session' && c.value !== '')).toBe(false)
    await page.goto('/overview')
    await expect(page).toHaveURL(/\/sign-in$/)
  })
})
