import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

test.describe('top bar', () => {
  test('fits a 320 px screen in both languages, so no page scrolls sideways', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.setViewportSize({ width: 320, height: 700 })

    for (const lang of ['en', 'ru']) {
      await page.goto(`/orders?lang=${lang}`)

      await expect(page.getByRole('banner')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
    }
  })

  test('the theme and language buttons have the size of the search button and the bell', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/overview')

    const bar = page.getByRole('banner')
    const sizes: string[] = []

    for (const name of [/^Search/, /^Notifications/, /^Theme:/, /^Language:/]) {
      sizes.push(await bar.getByRole('button', { name }).evaluate(el => `${Math.round(el.getBoundingClientRect().height)} px, ${getComputedStyle(el).fontSize}`))
    }

    expect(sizes).toEqual(['32 px, 14px', '32 px, 14px', '32 px, 14px', '32 px, 14px'])
  })

  test('the language button’s name holds the code it shows, in both languages', async ({ page, context }) => {
    await signInAsSandboxUser(context)

    for (const [lang, name, code] of [['en', 'Language: EN (English)', 'EN'], ['ru', 'Язык: RU (Русский)', 'RU']]) {
      await page.goto(`/overview?lang=${lang}`)

      const button = page.getByRole('banner').getByRole('button', { name })

      await expect(button).toBeVisible()
      await expect(button).toContainText(code!)
    }
  })
})
