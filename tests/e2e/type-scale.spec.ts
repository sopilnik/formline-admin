import type { Page } from '@playwright/test'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

/** Every text in Space Grotesk at a weight the panel does not load (only 400 and 700 ship), as "text — weight". */
const unshippedWeights = (page: Page) =>
  page.evaluate(() => {
    // The variable quotes the family name and the computed style does not: compare the first names without quotes.
    const first = (families: string) => families.split(',')[0]!.replace(/["']/g, '').trim()
    const family = first(getComputedStyle(document.documentElement).getPropertyValue('--font-space-grotesk'))
    const found: string[] = []

    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const own = [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== '')
      const s = getComputedStyle(el)

      if (own && el.offsetParent !== null && first(s.fontFamily) === family && !['400', '700'].includes(s.fontWeight)) {
        found.push(`${el.textContent!.trim().slice(0, 30)} — ${s.fontWeight}`)
      }
    }

    return found
  })

test.describe('type scale', () => {
  test('Space Grotesk only ever renders at the two weights the panel loads', async ({ page, context }) => {
    await page.goto('/sign-in')

    expect(await unshippedWeights(page)).toEqual([])

    await signInAsSandboxUser(context)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/overview')
    await page.getByRole('region', { name: 'Demo sandbox' }).getByRole('button', { name: 'Reset data' }).click()

    await expect(page.getByRole('dialog', { name: 'Reset the sandbox?' })).toBeVisible()
    expect(await unshippedWeights(page)).toEqual([])

    await page.getByRole('button', { name: 'Cancel' }).click()

    await page.goto('/settings/security')

    expect(await unshippedWeights(page)).toEqual([])
  })

  test('the Security cards use the card scale of the other settings tabs', async ({ page, context }) => {
    await signInAsSandboxUser(context)

    const scale = () =>
      page.locator('main section h2, main [data-slot=card] h2').evaluateAll(list =>
        [...new Set(list.map(el => `${getComputedStyle(el).fontSize} ${getComputedStyle(el).fontWeight}`))])

    await page.goto('/settings/store')

    const store = await scale()

    await page.goto('/settings/security')

    expect(store).toEqual(['15px 600'])
    expect(await scale()).toEqual(store)
  })

  test('the intro of a settings card keeps to 65 characters a line', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.setViewportSize({ width: 1920, height: 1000 })

    for (const path of ['/settings/store', '/settings/security']) {
      await page.goto(path)

      const widths = await page.locator('main h2 + p').evaluateAll(list =>
        list.map(el => {
          const probe = document.createElement('span')

          probe.textContent = '0'.repeat(65)
          el.append(probe)

          const limit = probe.getBoundingClientRect().width

          probe.remove()

          return el.getBoundingClientRect().width <= limit + 1
        }))

      expect(widths.length).toBeGreaterThan(0)
      expect(widths.every(Boolean)).toBe(true)
    }
  })
})
