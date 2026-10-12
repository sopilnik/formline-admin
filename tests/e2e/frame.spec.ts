import type { Page } from '@playwright/test'
import { expectNoSeriousA11yViolations } from './a11y.ts'
import { openFramed } from './ready.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

const sidebarBackground = (page: Page) => page.locator('aside').evaluate(el => getComputedStyle(el).backgroundColor)

test.describe('app frame', () => {
  test('has a skip link, landmarks and the sidebar on dark tokens in the light theme', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/overview')
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
    await openFramed(page, '/overview')
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
    await page.getByRole('button', { name: 'Language: English (EN)' }).click()
    await page.getByRole('menuitemradio', { name: 'Русский' }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
    await expect(page.getByRole('heading', { level: 1, name: 'Обзор' })).toBeVisible()
    await expect(page.getByRole('link', { name: /^Заказы/ })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Сообщения' })).toBeAttached()
  })

  test('the chosen theme and language are cookies the root error page can read in the browser', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/overview')
    await page.getByRole('button', { name: 'Theme: System' }).click()
    await page.getByRole('menuitemradio', { name: 'Dark' }).click()
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    // A radio item leaves its menu open; its backdrop would take the next click.
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toBeHidden()
    await page.getByRole('button', { name: 'Language: English (EN)' }).click()
    await page.getByRole('menuitemradio', { name: 'Русский' }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru')

    // app/global-error.tsx replaces the root layout and reads both through document.cookie.
    const cookie = await page.evaluate(() => document.cookie)
    expect(cookie).toMatch(/(?:^|; )formline_theme=dark(?:;|$)/)
    expect(cookie).toMatch(/(?:^|; )NEXT_LOCALE=ru(?:;|$)/)
  })

  test('a viewer does not see the team, the activity log or the outbox', async ({ page, context }) => {
    await signInAsSandboxUser(context, 'viewer')
    await page.goto('/overview')
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Team' })).toHaveCount(0)
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

  test('the menu moves between its widths in 200 ms with its icons in place', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/overview')
    const aside = page.locator('aside')
    const orders = aside.getByRole('link', { name: /^Orders/ })
    const iconLeft = () => orders.locator('svg').evaluate(el => Math.round(el.getBoundingClientRect().left))
    const before = await iconLeft()
    expect(await aside.evaluate(el => [getComputedStyle(el).transitionProperty, getComputedStyle(el).transitionDuration])).toEqual(['width', '0.2s'])

    // The same element before and after: a link drawn anew would show its label without the fade.
    await orders.evaluate(el => el.setAttribute('data-before-collapse', ''))
    await page.getByRole('button', { name: 'Collapse menu' }).click()
    await expect(aside).toHaveCSS('width', '68px')
    await expect(orders.getByText('Orders', { exact: true })).toHaveCSS('opacity', '0')
    await expect(orders).toHaveAttribute('data-before-collapse', '')
    expect(await iconLeft()).toBe(before)
    await expect(page.getByRole('button', { name: 'Expand menu' }).locator('svg')).toHaveCSS('width', '16px')

    // The faded labels never wrap and stick out to the right, so a sideways wheel must not scroll the icons away; the
    // scroll lands within two frames.
    const nav = aside.locator('nav')
    await nav.hover()
    await page.mouse.wheel(60, 0)
    expect(await nav.evaluate(el => new Promise<number>(done => requestAnimationFrame(() => requestAnimationFrame(() => done(el.scrollLeft)))))).toBe(0)

    // The system's "reduce motion" setting turns the move off (app/globals.css).
    await page.emulateMedia({ reducedMotion: 'reduce' })
    expect(await aside.evaluate(el => getComputedStyle(el).transitionDuration)).toBe('1e-05s')
  })

  test('the focus ring of every menu link is drawn whole, expanded and collapsed', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/overview')
    const nav = page.locator('aside nav')
    const orders = nav.getByRole('link', { name: /^Orders/ })
    await orders.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(orders).toBeFocused()
    // The ring reaches outline-width + outline-offset past the link; the nav clips whatever leaves its own box.
    const reach = await orders.evaluate(el => parseFloat(getComputedStyle(el).outlineWidth) + parseFloat(getComputedStyle(el).outlineOffset))
    expect(reach).toBe(4)
    const cut = () => nav.evaluate((el, ring) => {
      const box = el.getBoundingClientRect()
      return [...el.querySelectorAll('a')].flatMap(link => {
        const r = link.getBoundingClientRect()
        const sides = [r.left - ring < box.left && 'left', r.right + ring > box.right && 'right', r.top - ring < box.top && 'top']
        return sides.filter(Boolean).map(side => `${link.textContent}: ${side}`)
      })
    }, reach)
    expect(await cut()).toEqual([])

    await page.getByRole('button', { name: 'Collapse menu' }).click()
    await expect(page.locator('aside')).toHaveCSS('width', '68px')
    expect(await cut()).toEqual([])
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
