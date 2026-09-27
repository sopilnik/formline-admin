import { E2E_ORIGIN_SECRET } from './constants'
import { expect, test } from './test'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.24' } })

test('Enter the demo shows the overview within 3 seconds on a warm database (spec §1)', async ({ page, context }) => {
  // The first entry pays for cold caches and plans and is not measured.
  await page.goto('/sign-in')
  await page.getByRole('button', { name: 'Enter the demo' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
  await context.clearCookies()
  await page.goto('/sign-in')
  const started = Date.now()
  await page.getByRole('button', { name: 'Enter the demo' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
  const elapsed = Date.now() - started
  console.log(JSON.stringify({ event: 'measure.demo_entry_ms', elapsed }))
  expect(elapsed).toBeLessThan(3000)
})
