import type { BrowserContext, Locator } from '@playwright/test'
import { E2E_BASE_URL } from './constants.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

const chooseTheme = (context: BrowserContext, theme: 'light' | 'dark') =>
  context.addCookies([{ name: 'formline_theme', value: theme, url: E2E_BASE_URL }])

const paint = (target: Locator) =>
  target.evaluate(el => {
    const s = getComputedStyle(el)
    return { border: s.borderTopColor, background: s.backgroundColor }
  })

/** The input token on the card surface (spec §11): light #858880 on #FFFFFF, dark #74777D on #1A1B1D. */
const OUTLINE_BUTTON = {
  light: { border: 'rgb(133, 136, 128)', background: 'rgb(255, 255, 255)' },
  dark: { border: 'rgb(116, 119, 125)', background: 'rgb(26, 27, 29)' },
}

const FIELD = {
  light: { border: 'rgb(133, 136, 128)', background: 'rgba(0, 0, 0, 0)' },
  dark: { border: 'rgb(116, 119, 125)', background: 'rgba(0, 0, 0, 0)' },
}

test.describe('controls', () => {
  test('outline buttons and fields draw the input border over the card colour, in both themes', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.setViewportSize({ width: 1280, height: 800 })
    for (const theme of ['light', 'dark'] as const) {
      await chooseTheme(context, theme)
      await page.goto('/overview')
      const reset = page.getByRole('region', { name: 'Demo sandbox' }).getByRole('button', { name: 'Reset data' })
      expect(await paint(reset)).toEqual(OUTLINE_BUTTON[theme])

      await page.goto('/products')
      await page.locator('main tbody a, main [data-slot=card] a').first().click()
      expect(await paint(page.locator('#product-collection'))).toEqual(FIELD[theme])
    }
  })

  test('a form select ends a long value with an ellipsis, as the filter selects do', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/products')
    await page.locator('main tbody a, main [data-slot=card] a').first().click()
    const select = page.locator('#product-collection')
    expect(await select.evaluate(el => [getComputedStyle(el).textOverflow, getComputedStyle(el).whiteSpace])).toEqual(['ellipsis', 'nowrap'])
  })
})
