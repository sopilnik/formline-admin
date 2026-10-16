import type { Locator } from '@playwright/test'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

/** The banner's sentence as the visitor reads it: only the text that is shown at this width. */
const shownText = (banner: Locator) => banner.locator('p').evaluate(el => (el as HTMLElement).innerText.trim())

const lineCount = (target: Locator) =>
  target.evaluate(el => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)))

test.describe('demo banner', () => {
  test('on a phone it states the deletion rule in one short line, in both languages', async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 740 })
    await signInAsSandboxUser(context)

    const cases = [
      { lang: 'en', name: 'Demo sandbox', text: 'Demo sandbox. Deleted after 2 h idle.' },
      { lang: 'ru', name: 'Демо-песочница', text: 'Демо. Удаляется после 2 ч простоя.' },
    ]

    for (const { lang, name, text } of cases) {
      await page.goto(`/overview?lang=${lang}`)

      const banner = page.getByRole('region', { name })

      expect(await shownText(banner)).toBe(text)
      expect(await lineCount(banner.locator('p'))).toBe(1)
      expect(await banner.locator('p').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    }
  })

  test('from 640 px it keeps the whole rule', async ({ page, context }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await signInAsSandboxUser(context)
    await page.goto('/overview')

    const banner = page.getByRole('region', { name: 'Demo sandbox' })

    expect(await shownText(banner)).toBe('Demo sandbox. Your changes are private. The sandbox is deleted after 2 hours without activity, or after 24 hours at the latest.')
  })

  test('in Russian the overflow menu shows each action on one line', async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 740 })
    await signInAsSandboxUser(context)
    await page.goto('/overview?lang=ru')
    await page.getByRole('region', { name: 'Демо-песочница' }).getByRole('button', { name: 'Ещё действия' }).click()

    for (const name of ['Сбросить данные', 'Сменить пользователя']) {
      const item = page.getByRole('menuitem', { name })

      await expect(item).toBeVisible()
      expect(await item.evaluate(el => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().height < 36)).toBe(true)
    }
  })

  test('at 768 px in Russian the sentence keeps a readable column and the actions move below it', async ({ page, context }) => {
    await page.setViewportSize({ width: 768, height: 900 })
    await signInAsSandboxUser(context)
    await page.goto('/overview?lang=ru')

    const text = page.getByRole('region', { name: 'Демо-песочница' }).locator('p')

    expect((await text.boundingBox())!.width).toBeGreaterThanOrEqual(320)
  })
})
