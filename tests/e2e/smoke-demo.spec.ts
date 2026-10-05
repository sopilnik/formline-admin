import { E2E_BASE_URL, E2E_ORIGIN_SECRET } from './constants'
import { expect, test } from './test'

// The smoke test's demo on the e2e server, from an address of its own apart from the other files' demo entries.
test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.55' } })

// The script is an ES module of the scripts folder (its entry point reads import.meta), so each test loads it as one.
const smoke = () => import('../../scripts/smoke.ts')

test.describe('The smoke test\'s demo', () => {
  test('enters the demo, times it and ends it', async ({ page }) => {
    const { demoSteps } = await smoke()
    const checks = await demoSteps(page, E2E_BASE_URL)
    expect(checks.map(check => check.check)).toEqual(['enter the demo', 'end the demo'])
    expect(checks.every(check => check.ok)).toBe(true)
  })

  test('names the step that failed and logs the page it stopped on', async ({ page }) => {
    const { demoSteps, SNAPSHOT_LIMIT } = await smoke()
    // A sign-in page without the demo: the click on "Enter the demo" finds nothing to press.
    await page.route('**/sign-in', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Paused</title><h1>Back in a minute</h1>' }))
    page.setDefaultTimeout(2_000)
    const checks = await demoSteps(page, E2E_BASE_URL)
    expect(checks).toHaveLength(1)
    expect(checks[0]).toMatchObject({ check: 'demo', ok: false, page: { url: `${E2E_BASE_URL}/sign-in` } })
    expect(checks[0]?.detail).toMatch(/^enter the demo: locator\.click: Timeout 2000ms exceeded/)
    expect(checks[0]?.page?.snapshot).toContain('heading "Back in a minute" [level=1]')
    expect(checks[0]?.page?.snapshot.length).toBeLessThanOrEqual(SNAPSHOT_LIMIT)
  })
})
