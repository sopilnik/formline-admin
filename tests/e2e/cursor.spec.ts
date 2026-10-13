import type { Locator } from '@playwright/test'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

const cursorOf = (target: Locator) => target.evaluate(el => getComputedStyle(el).cursor)

// Browsers give buttons the arrow, and Tailwind v4 no longer overrides it; app/globals.css gives everything that can be
// pressed the hand.
test.describe('pointer cursor', () => {
  test('everything that can be pressed shows the hand, and a disabled button does not', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/overview')
    const header = page.getByRole('banner')
    for (const name of [/^Notifications/, /^Theme/, /^Language/, /^Account menu/]) {
      expect(await cursorOf(header.getByRole('button', { name })), String(name)).toBe('pointer')
    }

    await header.getByRole('button', { name: /^Theme/ }).click()
    const themes = page.getByRole('menu', { name: /^Theme/ }).getByRole('menuitemradio')
    await expect(themes).toHaveCount(3)
    expect(await Promise.all((await themes.all()).map(cursorOf))).toEqual(['pointer', 'pointer', 'pointer'])
    await page.keyboard.press('Escape')
    await expect(themes).toHaveCount(0)

    await header.getByRole('button', { name: /^Account menu/ }).click()
    expect(await cursorOf(page.getByRole('menuitem', { name: 'Sign out' }))).toBe('pointer')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menuitem', { name: 'Sign out' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Switch user' }).click()
    const people = page.getByRole('dialog').locator('label')
    await expect(people.first()).toBeVisible()
    expect(await cursorOf(people.first())).toBe('pointer')
    await page.keyboard.press('Escape')
    await expect(people).toHaveCount(0)

    await page.keyboard.press('Control+k')
    const option = page.getByRole('option').first()
    await expect(option).toBeVisible()
    expect(await cursorOf(option)).toBe('pointer')
    await page.keyboard.press('Escape')

    await page.goto('/orders')
    expect(await cursorOf(page.getByRole('checkbox').first())).toBe('pointer')
    expect(await cursorOf(page.locator('select').first())).toBe('pointer')

    await page.goto('/collections')
    expect(await cursorOf(page.getByRole('button', { name: 'Move Monochrome up' }))).not.toBe('pointer')
  })
})
