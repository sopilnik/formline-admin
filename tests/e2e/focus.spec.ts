import type { Locator, Page } from '@playwright/test'
import { frameHydrated } from './ready.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

/** The primary colour of the light theme, which every focus indicator outside the sidebar draws. */
const RING = 'rgb(191, 58, 14)'

/** Focuses the element the way a keyboard reaches it, so `:focus-visible` matches as it does for a visitor. */
async function focusByKeyboard(page: Page, target: Locator): Promise<void> {
  await frameHydrated(page)
  await target.focus()
  await page.keyboard.press('Shift+Tab')
  // Tab on from the element before it, a few stops at most: a group of radios or toggles is one stop.
  for (let stop = 0; stop < 5 && !(await target.evaluate(el => el === document.activeElement)); stop++) await page.keyboard.press('Tab')
  await expect(target).toBeFocused()
}

const outlineOf = (target: Locator) =>
  target.evaluate(el => {
    const s = getComputedStyle(el)
    return [s.outlineStyle, s.outlineWidth, s.outlineColor]
  })

/** Whether the ring (outline width plus offset past the box) stays inside the nearest box that clips it, side by side. */
const ringInsideItsClip = (target: Locator) =>
  target.evaluate(el => {
    const s = getComputedStyle(el)
    const reach = parseFloat(s.outlineWidth) + parseFloat(s.outlineOffset)
    let box = el.parentElement
    while (box && getComputedStyle(box).overflowX === 'visible' && getComputedStyle(box).overflowY === 'visible') box = box.parentElement
    if (!box) return { left: true, top: true, right: true, bottom: true }
    const r = el.getBoundingClientRect()
    const b = box.getBoundingClientRect()
    return { left: r.left - reach >= b.left, top: r.top - reach >= b.top, right: r.right + reach <= b.right, bottom: r.bottom + reach <= b.bottom }
  })

const whole = { left: true, top: true, right: true, bottom: true }

test.describe('keyboard focus', () => {
  test('every kind of control shows the solid outline when the keyboard reaches it', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/orders')
    const controls = [
      page.getByRole('searchbox'),
      page.getByRole('button', { name: /^Export [\d,]+ as CSV$/ }),
      page.getByRole('checkbox', { name: /^Select order #\d+$/ }).first(),
    ]
    for (const control of controls) {
      await focusByKeyboard(page, control)
      // A field fades its outline colour in (transition-colors), so the reading waits for the end of it.
      await expect.poll(() => outlineOf(control)).toEqual(['solid', '2px', RING])
    }

    await page.getByRole('link', { name: /^Customers/ }).click()
    await page.locator('main tbody a, main [data-slot=card] a').first().click()
    const notes = page.getByRole('textbox', { name: 'Notes about this customer' })
    await focusByKeyboard(page, notes)
    await expect.poll(() => outlineOf(notes)).toEqual(['solid', '2px', RING])
  })

  test('the highlighted item of a menu and of the command palette shows the outline', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/overview')
    const account = page.getByRole('button', { name: /^Account menu:/ })
    await focusByKeyboard(page, account)
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowDown')
    const item = page.locator('[role=menuitem]:focus')
    await expect(item).toBeFocused()
    await expect.poll(() => outlineOf(item)).toEqual(['solid', '2px', RING])
    await page.keyboard.press('Escape')

    await page.keyboard.press('Control+k')
    await page.keyboard.type('ord')
    await page.keyboard.press('ArrowDown')
    const option = page.locator('[role=option][data-highlighted]')
    await expect(option).toHaveCount(1)
    await expect.poll(() => outlineOf(option)).toEqual(['solid', '2px', RING])
  })

  test('a focus ring is never cut by a box that scrolls', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('/settings/profile')
    const tab = page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name: 'Profile' })
    await focusByKeyboard(page, tab)
    expect(await ringInsideItsClip(tab)).toEqual(whole)

    await page.goto('/orders')
    const chip = page.getByRole('button', { name: /^All, / })
    await focusByKeyboard(page, chip)
    expect(await ringInsideItsClip(chip)).toEqual(whole)

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/overview')
    const order = page.getByRole('table', { name: /Latest orders/ }).getByRole('link').first()
    await focusByKeyboard(page, order)
    expect(await ringInsideItsClip(order)).toEqual(whole)
  })

  test('a pending button keeps the focus and takes no second press', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/customers')
    await page.locator('main tbody a, main [data-slot=card] a').first().click()
    await expect(page.getByRole('textbox', { name: 'Notes about this customer' })).toBeVisible()

    // Hold the Server Action, so the button stays pending while the test looks at it.
    let posts = 0
    let release = () => {}
    const held = new Promise<void>(resolve => { release = resolve })
    await page.route('**/customers/**', async route => {
      if (route.request().method() !== 'POST') return route.continue()
      posts += 1
      await held
      await route.continue()
    })
    await page.getByRole('textbox', { name: 'Notes about this customer' }).fill('Prefers matte frames.')
    const save = page.getByRole('button', { name: 'Save notes' })
    await focusByKeyboard(page, save)
    await page.keyboard.press('Enter')

    const pending = page.getByRole('button', { name: 'Saving…' })
    await expect(pending).toBeFocused()
    await expect(pending).toHaveAttribute('aria-disabled', 'true')
    await page.keyboard.press('Enter')
    release()

    await expect(page.getByText('Notes saved.')).toBeVisible()
    expect(posts).toBe(1)
  })
})
