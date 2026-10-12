import type { Locator, Page } from '@playwright/test'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

/** Holds the server's answer for one page while the test looks at its loading state; the returned function lets it go. */
async function holdPage(page: Page, path: string): Promise<() => void> {
  let release = () => {}
  const held = new Promise<void>(resolve => { release = resolve })
  // Only the navigation's request waits: the prefetch brings the loading state and must arrive.
  await page.route(url => url.pathname === path && url.searchParams.has('_rsc'), async route => {
    if (route.request().headers()['next-router-prefetch']) return route.continue()
    await held
    await route.continue()
  })
  return release
}

const top = async (target: Locator) => Math.round((await target.boundingBox())!.y)

/** A colour token of the page's theme as the browser resolves it, read through a throwaway element. */
const tokenColour = (page: Page, token: string) =>
  page.evaluate(name => {
    const probe = document.createElement('div')
    probe.style.backgroundColor = `var(${name})`
    document.body.append(probe)
    const colour = getComputedStyle(probe).backgroundColor
    probe.remove()
    return colour
  }, token)

test.describe('overview layout', () => {
  test('its loading state has the page’s shape and stands out from the canvas', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.setViewportSize({ width: 1100, height: 900 })
    await page.goto('/orders')
    await expect(page.getByRole('heading', { level: 1, name: 'Orders' })).toBeVisible()
    // Not a wait for hydration: the overview's prefetch, which brings its loading state, must arrive before the hold.
    await page.waitForLoadState('networkidle')
    const release = await holdPage(page, '/overview')
    await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Overview' }).click()

    const loading = page.locator('main [role=status]').filter({ hasText: 'Loading the overview…' })
    await expect(loading).toBeVisible()
    const skeletons = loading.locator('[data-slot=skeleton]')
    expect(await skeletons.first().evaluate(el => getComputedStyle(el).backgroundColor)).toBe(await tokenColour(page, '--border'))
    const kpisWhileLoading = await top(loading.locator('[data-part=kpi]').first())
    const panels = loading.locator('[data-part=panel]')
    expect(await top(panels.nth(1))).toBeGreaterThan(await top(panels.nth(0)))

    release()
    const kpis = page.getByRole('region', { name: 'Key figures' })
    await expect(kpis).toBeVisible()
    expect(Math.abs((await top(kpis)) - kpisWhileLoading)).toBeLessThanOrEqual(6)
  })

  test('the latest orders end at the card’s inner edge, under the link to all orders', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/overview')
    const card = page.locator('section[aria-labelledby=latest-title]')
    // React may still hold the streamed table in a hidden template; measure it once it is shown (10 October).
    await expect(card.getByRole('table', { name: 'Latest orders' })).toBeVisible()
    const lastHeader = card.locator('thead th').last()
    const contentRight = await lastHeader.evaluate(el => el.getBoundingClientRect().right - parseFloat(getComputedStyle(el).paddingRight))
    const link = await card.getByRole('link', { name: 'All orders' }).boundingBox()
    expect(Math.abs(contentRight - (link!.x + link!.width))).toBeLessThanOrEqual(1)
  })

  test('the overview’s cards share one inner edge on a phone and on a desktop', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    for (const [width, padding] of [[375, '16px'], [1280, '20px']] as const) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/overview')
      const cards = page.locator('main [role=group][aria-labelledby], main section[aria-labelledby]')
      await expect(cards.first()).toBeVisible()
      const paddings = await cards.evaluateAll(list => [...new Set(list.map(el => getComputedStyle(el).paddingLeft))])
      expect(paddings).toEqual([padding])
    }
  })

  test('activity rows keep the 44 px density of the other tables', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/activity')
    const rows = page.locator('main tbody tr')
    await expect(rows.first()).toBeVisible()
    const heights = await rows.evaluateAll(list => list.map(row => row.getBoundingClientRect().height))
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44)
  })
})
